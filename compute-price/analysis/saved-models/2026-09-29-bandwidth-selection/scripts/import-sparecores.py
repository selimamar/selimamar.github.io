#!/usr/bin/env python3
"""Import original, measured Geekbench CPU results from Spare Cores.

Only the small geekbench task files are fetched, never the full repository.
The exact upstream commit is recorded and every evidence URL is pinned to it.
Uses only the Python standard library. Re-run with --commit and the same supplied
catalog/specification snapshots to reproduce the selection and hardware joins.
"""

import argparse
import collections
import concurrent.futures
import datetime
import hashlib
import http.client
import json
import math
import pathlib
import re
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY = "SpareCores/sc-inspector-data"
REPO_URL = "https://github.com/" + REPOSITORY
API = "https://api.github.com/repos/" + REPOSITORY
RAW = "https://raw.githubusercontent.com/" + REPOSITORY
COMPATIBLE = ("6.3", "6.4", "6.5", "6.6", "6.7")
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"
CONNECTIONS = threading.local()


def download(url, timeout):
    """Reuse HTTPS connections per worker, including standard HTTP proxies."""
    target = urllib.parse.urlparse(url)
    proxy = urllib.parse.urlparse(urllib.request.getproxies().get("https", ""))
    headers = {"User-Agent": "compute-price-research/1.0", "Accept": "application/vnd.github+json"}
    if proxy.hostname and (proxy.scheme != "http" or proxy.username):
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as response:
            return response.read()
    if not hasattr(CONNECTIONS, "items"):
        CONNECTIONS.items = {}
    key = (target.hostname, proxy.hostname, proxy.port)
    connection = CONNECTIONS.items.get(key)
    if connection is None:
        connection = http.client.HTTPSConnection(proxy.hostname or target.hostname, proxy.port or (80 if proxy.hostname else 443), timeout=timeout)
        if proxy.hostname:
            connection.set_tunnel(target.hostname, target.port or 443)
        CONNECTIONS.items[key] = connection
    try:
        connection.request("GET", target.path + ("?" + target.query if target.query else ""), headers=headers)
        response = connection.getresponse()
        data = response.read()
        if response.status >= 400:
            raise urllib.error.HTTPError(url, response.status, response.reason, response.headers, None)
        return data
    except Exception:
        connection.close()
        CONNECTIONS.items.pop(key, None)
        raise


class Rejected(ValueError):
    pass


def read_url(url, cache_dir, timeout=25):
    path = cache_dir / hashlib.sha256(url.encode()).hexdigest()
    missing = path.with_suffix(".missing")
    if missing.exists():
        raise Rejected("task_not_available")
    if path.exists():
        return path.read_bytes()
    for attempt in range(3):
        try:
            data = download(url, timeout)
            path.write_bytes(data)
            return data
        except urllib.error.HTTPError as error:
            if error.code == 404:
                missing.touch()
                raise Rejected("task_not_available") from error
            if error.code in (403, 429) and attempt < 2:
                time.sleep(3 * (attempt + 1))
            elif attempt == 2:
                raise
        except (OSError, TimeoutError, http.client.HTTPException):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise Rejected("download_failed")


def json_url(url, cache):
    return json.loads(read_url(url, cache))


def field(output, name):
    match = re.search(r"^\s*" + re.escape(name) + r"\s{2,}([^\n]+)", output, re.M)
    return match.group(1).strip() if match else None


def parse_stdout(output):
    version = re.search(r"Geekbench\s+(\d+\.\d+\.\d+)\s+([^:\n]+)", output)
    topology = field(output, "Topology") or ""
    threads = re.search(r"([\d,]+) Threads?", topology, re.I)
    cores = re.search(r"([\d,]+) Cores?", topology, re.I)
    size = field(output, "Size") or ""
    memory = re.fullmatch(r"([\d,.]+)\s*(GB|GiB|MB|MiB|TB|TiB)", size)
    summary = re.search(r"^\s*Multi-Core Score\s+([\d,]+)\s*$", output, re.M)
    if not version or not (threads or cores) or not memory:
        raise Rejected("incomplete_output")
    vcpus = int((threads or cores).group(1).replace(",", ""))
    reported_memory = float(memory.group(1).replace(",", ""))
    if memory.group(2) in ("MB", "MiB"):
        reported_memory /= 1024
    elif memory.group(2) in ("TB", "TiB"):
        reported_memory *= 1024
    return {
        "version": version.group(1), "edition": version.group(2).strip(),
        "system": field(output, "Operating System"), "kernel": field(output, "Kernel"),
        "model": field(output, "Model"), "cpuModel": field(output, "Name"),
        "topology": topology, "vcpus": vcpus,
        "reportedMemoryGB": reported_memory, "reportedMemoryRaw": size,
        "instructionSets": field(output, "Instruction Sets"),
        "score": int(summary.group(1).replace(",", "")) if summary else None,
    }


def load_specs(path):
    if not path or not path.exists():
        return {}
    data = json.loads(path.read_text())
    rows = data if isinstance(data, list) else data.get("instances", data.get("records", []))
    return {(row["provider"], row["name"]): row for row in rows}


def import_one(provider, name, commit, cache, specs, retrieved_at):
    source_path = "data/" + provider + "/" + name + "/geekbench/"
    base = RAW + "/" + commit + "/" + urllib.parse.quote(source_path, safe="/.")
    meta = json_url(base + "meta.json", cache)
    if meta.get("exit_code") != 0 or meta.get("error_msg"):
        raise Rejected("task_failed")
    if ".".join(str(meta.get("version", "")).split(".")[:2]) not in COMPATIBLE:
        raise Rejected("incompatible_version")
    output = read_url(base + "stdout", cache).decode("utf-8", errors="replace")
    parsed = parse_stdout(output)
    if parsed["version"] != meta.get("version"):
        raise Rejected("version_mismatch")
    if not parsed.get("kernel") or not parsed["kernel"].startswith("Linux "):
        raise Rejected("not_linux")
    results = json_url(base + "results.json", cache)
    try:
        score = results["Multi-Core Performance"]["Score"]["score"]
    except (KeyError, TypeError):
        raise Rejected("missing_multicore_result")
    if not isinstance(score, (int, float)) or not math.isfinite(score) or score <= 0 or (parsed["score"] is not None and score != parsed["score"]):
        raise Rejected("score_mismatch")
    parsed["scoreCrossCheckedInStdout"] = parsed["score"] is not None
    parsed["score"] = score
    # Never assume that a run measured all advertised vCPUs. Inspector can limit
    # tasks on very large hosts; the topology must match the nominal catalog.
    spec = specs.get((provider, name))
    nominal_ram = None
    if spec:
        if parsed["vcpus"] != spec.get("vcpus"):
            raise Rejected("vcpu_mismatch")
        nominal_ram = spec.get("ramGiB")
        if not isinstance(nominal_ram, (int, float)) or nominal_ram <= 0:
            raise Rejected("invalid_nominal_memory")
        guest_ram = parsed["reportedMemoryGB"]
        if guest_ram > nominal_ram * 1.05 or guest_ram < nominal_ram * .85 - .35:
            raise Rejected("memory_mismatch")
    if provider == "aws" and parsed.get("model", "").startswith("Amazon EC2 ") and parsed["model"] != "Amazon EC2 " + name:
        raise Rejected("model_mismatch")
    run_at = meta.get("end") or meta.get("start")
    if not run_at:
        raise Rejected("missing_run_date")
    # Upstream timestamps lack a zone; preserve them rather than invent UTC.
    parsed.update({
        "ramGiB": nominal_ram, "runAt": run_at, "runTimeZone": "unspecified",
        "retrievedAt": retrieved_at, "url": base + "stdout",
        "resultUrl": base + "results.json", "metadataUrl": base + "meta.json",
        "authorUrl": REPO_URL + "/tree/" + commit + "/" + source_path.rstrip("/"),
        "sourceType": "sparecores-original-measured-output", "sampleCount": 1,
        "region": None, "nominalSpecsVerified": bool(spec),
        "nominalSpecsSource": spec.get("sourceUrl", spec.get("specSourceUrl")) if spec else None,
    })
    browser_url = re.search(r"https://browser\.geekbench\.com/v6/cpu/(\d+)", output)
    if browser_url and browser_url.group(1) != "99999999":
        parsed["browserUrl"] = browser_url.group(0)
    # Inspector sometimes writes a placeholder /99999999 upload URL. Original
    # measured stdout/results are the source; never link this as a Browser run.
    return {"provider": provider, "name": name, "geekbench6Multi": parsed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("data/sparecores-benchmarks.json"))
    parser.add_argument("--catalog", type=pathlib.Path, default=pathlib.Path("data/price-catalog.json"))
    parser.add_argument("--specs", type=pathlib.Path, default=pathlib.Path("data/sparecores-server-specs.json"))
    parser.add_argument("--commit", help="Pinned upstream commit; defaults to current main")
    parser.add_argument("--providers", nargs="+", default=["aws", "azure", "gcp", "digitalocean"])
    parser.add_argument("--workers", type=int, default=24)
    parser.add_argument("--cache-dir", type=pathlib.Path, default=pathlib.Path(tempfile.gettempdir()) / "compute-price-sparecores")
    parser.add_argument("--limit", type=int, help="For import smoke checks only")
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    # Resolve the moving branch afresh; only immutable commit/tree/task URLs
    # use the persistent cache so a later import can discover newly run tests.
    commit = args.commit or json.loads(download(API + "/commits/main", 25))["sha"]
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        parser.error("--commit must be a full 40-character commit SHA")
    root = json_url(API + "/git/trees/" + commit, args.cache_dir)
    data_tree = next(row["sha"] for row in root["tree"] if row["path"] == "data")
    providers = json_url(API + "/git/trees/" + data_tree, args.cache_dir)
    available = {row["path"]: row["sha"] for row in providers["tree"] if row["type"] == "tree"}
    specs = load_specs(args.specs)
    specs.update(load_specs(args.catalog))  # Official selected price catalog wins.
    selected, counts, absent = [], {}, []
    for provider in args.providers:
        if provider not in available:
            absent.append(provider)
            continue
        tree = json_url(API + "/git/trees/" + available[provider], args.cache_dir)
        if tree.get("truncated"):
            raise RuntimeError("Provider server listing truncated; import aborted: " + provider)
        names = [row["path"] for row in tree["tree"] if row["type"] == "tree"]
        counts[provider] = len(names)
        selected.extend((provider, name) for name in names)
    selected.sort()
    if args.limit:
        selected = selected[:args.limit]
    print("Upstream commit", commit, "configurations", counts, "missing providers", absent, flush=True)
    retrieved_at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    records, excluded, errors, rejected = [], collections.Counter(), [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        jobs = {executor.submit(import_one, p, n, commit, args.cache_dir, specs, retrieved_at): (p, n) for p, n in selected}
        for index, future in enumerate(concurrent.futures.as_completed(jobs), 1):
            provider, name = jobs[future]
            try:
                records.append(future.result())
            except Rejected as error:
                excluded[str(error)] += 1
                rejected.append({"provider": provider, "name": name, "reason": str(error)})
            except Exception as error:
                excluded["download_or_parse_error"] += 1
                errors.append({"provider": provider, "name": name, "error": str(error)[:220]})
            if index % 100 == 0 or index == len(jobs):
                print("Processed", index, "/", len(jobs), "accepted", len(records), "excluded", dict(excluded), flush=True)
    records.sort(key=lambda row: (row["provider"], row["name"]))
    result = {
        "schemaVersion": 1,
        "attribution": {
            "title": "Spare Cores cloud server benchmark measurements", "creator": "Spare Cores",
            "source": REPO_URL, "sourceCommit": commit,
            "sourceLicenseUrl": REPO_URL + "/blob/" + commit + "/LICENSE",
            "license": "CC-BY-SA-4.0", "licenseUrl": LICENSE_URL,
            "changes": "Selected AWS, Azure and GCP Linux Geekbench CPU task results; parsed scores, metadata and hardware; joined nominal public catalog specifications; rejected incomplete, failed and mismatched runs. No scores estimated or rescaled.",
        },
        "methodology": {
            "name": "Original measured Geekbench 6 multicore cloud-VM results",
            "compatibleVersions": list(COMPATIBLE),
            "compatibilitySource": "https://www.geekbench.com/blog/2026/04/geekbench-67/",
            "compatibilitySources": ["https://www.geekbench.com/blog/2026/04/geekbench-67/", "https://www.geekbench.com/blog/2025/01/geekbench-64/"],
            "selection": "One currently published successful Linux CPU task per provider and exact server API reference, at the pinned repository commit. No extrapolation across VM sizes or processors.",
            "hardwareVerification": "Thread count must match nominal vCPUs where catalog specs exist. Reported guest memory must be within 15% plus 0.35 GiB below nominal, or at most 5% above. Provider and exact VM API name are the original author's repository path. An AWS model that names an EC2 shape must match; older Xen models are generic. Rows without nominal specifications are retained with nominalSpecsVerified=false and ramGiB=null; exclude these until joined and verified.",
            "scoreVerification": "Positive finite multicore score from original results.json; cross-checked against stdout summary wherever present. AArch64 Preview output may omit the summary. Task must have exit_code=0 and no error.",
            "limitation": "Historical single runs by Spare Cores, not provider performance guarantees, repeated-trial estimates, sustained-load guarantees or measurements from the selected pricing region. Test software, host CPUs and dates vary. Current Inspector configuration skips Geekbench on hosts above 32 CPUs and sets a container memory limit to 85% of host memory; historical configurations vary. Mismatched CPU topology is excluded rather than scaled. Original task timestamps have no timezone and are preserved without inventing one.",
            "testHarnessSource": "https://github.com/SpareCores/sc-inspector/blob/main/inspector/tasks.py",
            "sourceLinks": "Commit-pinned original benchmark-author output. Upstream placeholder Geekbench Browser upload URLs are deliberately not used.",
            "retrievedAt": retrieved_at,
        },
        "importSummary": {
            "availableConfigurations": counts, "attemptedConfigurations": len(selected),
            "accepted": len(records), "acceptedByProvider": dict(collections.Counter(row["provider"] for row in records)),
            "nominalSpecsVerified": sum(row["geekbench6Multi"]["nominalSpecsVerified"] for row in records),
            "versions": dict(collections.Counter(row["geekbench6Multi"]["version"] for row in records)),
            "missingProviders": absent, "exclusions": dict(excluded), "errors": errors,
            "rejectedRecords": sorted(rejected, key=lambda row: (row["provider"], row["name"])),
            "limitedImport": bool(args.limit),
        },
        "records": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary_output.write_text(json.dumps(result, indent=2) + "\n")
    temporary_output.replace(args.output)
    print("Wrote", args.output, json.dumps({key: value for key, value in result["importSummary"].items() if key != "rejectedRecords"}, indent=2), flush=True)


if __name__ == "__main__":
    main()
