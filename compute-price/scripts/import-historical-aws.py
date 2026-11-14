#!/usr/bin/env python3
"""Rebuild the retrospective AWS annual price archive inputs from public CSVs.

Defaults reproduce 2016–2025; the application adds its current AWS catalog as the
latest point. Historical Geekbench inputs are modern, fixed measurements.
"""
import argparse
import concurrent.futures
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://pricing.us-east-1.amazonaws.com'
INDEX_URL = BASE + '/offers/v1.0/aws/AmazonEC2/index.json'
DOCS = [
    'https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api-fetching-price-list-files-manually.html',
    'https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/service-version-index-file-for-aws-service.html',
]


def project_path(value):
    path = Path(value).expanduser()
    return path if path.is_absolute() else ROOT / path


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def choose_versions(index, years):
    chosen = []
    for year in years:
        # The September 2016 archive predates P2's launch. October is the first
        # verified archived sample containing the mapped P2 offerings.
        target = f'{year}-10-01T00:00:00Z' if year == 2016 else f'{year}-09-29T00:00:00Z'
        candidates = [
            (version, entry) for version, entry in index['versions'].items()
            if entry['versionEffectiveBeginDate'] <= target
            and (not entry['versionEffectiveEndDate'] or target < entry['versionEffectiveEndDate'])
        ]
        if len(candidates) != 1:
            raise ValueError(f'Expected one effective archive for {target}; found {len(candidates)}')
        version, entry = candidates[0]
        if not re.fullmatch(r'\d{14}', version):
            raise ValueError(f'Unexpected AWS archive version: {version}')
        chosen.append({'year': year, 'version': version, **entry})
    return chosen


def validate_cached(snapshot, selection, known):
    if snapshot.get('extractVersion') != 2 or snapshot.get('version') != selection['version']:
        return False
    if not re.fullmatch(r'[a-f0-9]{64}', snapshot.get('sha256', '')):
        return False
    expected_url = f"{BASE}/offers/v1.0/aws/AmazonEC2/{selection['version']}/us-east-1/index.csv"
    if snapshot.get('sourceUrl') != expected_url or not snapshot.get('byteCount'):
        return False
    seen = set()
    for row in snapshot.get('records', []):
        source = known.get(row['name'])
        if not source or row['name'] in seen or row['hourlyUsd'] <= 0:
            return False
        seen.add(row['name'])
        for key in ('ramGiB', 'vcpus', 'cpuScore', 'gpuCount', 'bandwidthPerGpuGBps'):
            if row.get(key) != source.get(key):
                return False
    return len(seen) == snapshot.get('matchedCpuCount', 0) + snapshot.get('matchedGpuCount', 0)


def extract(selection, known, cache_dir, refresh):
    destination = cache_dir / f"{selection['year']}-matched.json"
    if destination.exists() and not refresh:
        cached = json.loads(destination.read_text())
        if validate_cached(cached, selection, known):
            print(f"{selection['year']}: using verified filtered cache", flush=True)
            return cached

    url = f"{BASE}/offers/v1.0/aws/AmazonEC2/{selection['version']}/us-east-1/index.csv"
    digest = hashlib.sha256()
    byte_count = 0
    csv_row_count = 0
    eligible_count = 0
    records, rejected = [], []
    with urllib.request.urlopen(url, timeout=120) as response:
        headers = dict(response.headers)

        def decoded_lines():
            nonlocal byte_count
            for raw_line in response:
                digest.update(raw_line)
                byte_count += len(raw_line)
                yield raw_line.decode('utf-8-sig')

        lines = decoded_lines()
        metadata = dict(next(csv.reader([next(lines)])) for _ in range(5))
        for row in csv.DictReader(lines):
            csv_row_count += 1
            if not (
                row.get('TermType') == 'OnDemand'
                and row.get('Operating System') == 'Linux'
                and row.get('Tenancy') == 'Shared'
                and row.get('Pre Installed S/W') == 'NA'
                and row.get('Unit') == 'Hrs'
                and row.get('Product Family') == 'Compute Instance'
                and row.get('Currency') == 'USD'
                and row.get('Location') == 'US East (N. Virginia)'
                and row.get('CapacityStatus', 'Used') == 'Used'
            ):
                continue
            hourly_price = float(row['PricePerUnit'])
            if hourly_price <= 0:
                continue
            eligible_count += 1
            machine = known.get(row.get('Instance Type'))
            if machine is None:
                continue
            memory = float(re.sub(r'[^0-9.]', '', row['Memory']))
            vcpus = float(row['vCPU'])
            mismatches = []
            if abs(memory - machine['ramGiB']) > 0.01:
                mismatches.append('ramGiB')
            if vcpus != machine['vcpus']:
                mismatches.append('vcpus')
            if machine['type'] == 'gpu' and row.get('GPU') and float(row['GPU']) != machine['gpuCount']:
                mismatches.append('gpuCount')
            record = {
                'provider': 'aws', 'id': machine['id'], 'name': machine['name'],
                'kind': machine['type'], 'modelFamily': machine['modelFamily'],
                'hourlyUsd': hourly_price, 'ramGiB': memory, 'vcpus': vcpus,
                'cpuScore': machine['cpuScore'], 'gpuCount': machine.get('gpuCount'),
                'bandwidthPerGpuGBps': machine.get('bandwidthPerGpuGBps'),
                'gpuModelGroup': machine.get('gpuModelGroup'), 'sku': row['SKU'],
                'rateCode': row['RateCode'], 'effectiveDate': row['EffectiveDate'],
                'priceDescription': row['PriceDescription'], 'operation': row.get('operation'),
                'usageType': row.get('usageType'), 'physicalProcessor': row.get('Physical Processor'),
                'archiveMemory': row['Memory'],
            }
            if record['effectiveDate'][:10] > metadata['Publication Date'][:10]:
                raise ValueError(f'Price effective after archive publication: {record["name"]}')
            if mismatches:
                rejected.append({**record, 'mismatchFields': mismatches, 'currentRamGiB': machine['ramGiB']})
            else:
                records.append(record)
    if headers.get('Content-Length') and byte_count != int(headers['Content-Length']):
        raise ValueError(f'Incomplete archive download: {url}')
    if len({row['name'] for row in records}) != len(records):
        raise ValueError(f'Duplicate machine rates in {url}')
    result = {
        'extractVersion': 2, **selection, 'date': metadata['Publication Date'][:10],
        'publicationDate': metadata['Publication Date'],
        'effectiveStart': selection['versionEffectiveBeginDate'],
        'effectiveEnd': selection['versionEffectiveEndDate'], 'sourceUrl': url,
        'retrievedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'sourceMetadata': metadata, 'httpHeaders': headers, 'sha256': digest.hexdigest(),
        'byteCount': byte_count, 'csvRowCount': csv_row_count,
        'eligibleOnDemandLinuxCount': eligible_count,
        'matchedCpuCount': sum(row['kind'] == 'cpu' for row in records),
        'matchedGpuCount': sum(row['kind'] == 'gpu' for row in records),
        'records': sorted(records, key=lambda row: row['name']),
        'rejectedHardwareMismatch': rejected,
    }
    save_json(destination, result)
    print(f"{selection['year']}: {result['matchedCpuCount']} CPU / {result['matchedGpuCount']} GPU; {len(rejected)} hardware conflicts excluded", flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='data/historical-aws-prices.json', help='Absolute path or project-relative destination')
    parser.add_argument('--cache-dir', default='.cache/historical-aws', help='Absolute path or project-relative cache directory')
    parser.add_argument('--mapping', default='data/historical-benchmark-mapping.json', help='Absolute path or project-relative saved hardware map')
    parser.add_argument('--years', nargs='+', type=int, default=list(range(2016, 2026)))
    parser.add_argument('--refresh', action='store_true', help='Fetch the index and archives again, bypassing filtered caches')
    args = parser.parse_args()
    cache_dir = project_path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    index_file = cache_dir / 'version-index.json'
    if args.refresh or not index_file.exists():
        with urllib.request.urlopen(INDEX_URL, timeout=60) as response:
            index_file.write_bytes(response.read())
    index_bytes = index_file.read_bytes()
    index = json.loads(index_bytes)
    mapping_file = project_path(args.mapping)
    mapping_bytes = mapping_file.read_bytes()
    known = {row['name']: row for row in json.loads(mapping_bytes)['records'] if row['provider'] == 'aws'}
    selected = choose_versions(index, sorted(set(args.years)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(extract, selection, known, cache_dir, args.refresh) for selection in selected]
        snapshots = [future.result() for future in futures]
    for snapshot in snapshots:
        snapshot.pop('asOf', None)
        for row in snapshot['records']:
            row['provider'] = 'aws'
        for kind in ('cpu', 'gpu'):
            snapshot[kind + 'FamilyCount'] = len({row['modelFamily'] for row in snapshot['records'] if row['kind'] == kind})
        snapshot['selectionNote'] = (
            'First selected 2016 archive after P2 launch; published October 26, not September 29.'
            if snapshot['year'] == 2016 else
            'September effective-price archive; point date is actual archive publication date, which can be in October.'
        )
    result = {
        'schemaVersion': '1.0.0', 'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'provider': 'aws', 'region': 'us-east-1', 'regionName': 'US East (N. Virginia)', 'currency': 'USD',
        'priceBasis': 'Linux, shared tenancy, ordinary OnDemand, Used capacity where field available; no pre-installed software, no Spot or Reserved prices',
        'sourceIndex': {'url': INDEX_URL, 'sha256': hashlib.sha256(index_bytes).hexdigest(), 'publicationDate': index['publicationDate']},
        'documentationUrls': DOCS, 'benchmarkMapping': str(mapping_file.relative_to(ROOT)) if mapping_file.is_relative_to(ROOT) else str(mapping_file),
        'benchmarkMappingSha256': hashlib.sha256(mapping_bytes).hexdigest(),
        'matchingRule': 'Exact AWS instance type; archived nominal RAM, vCPU, and GPU count (when present) must match the saved hardware mapping. CPU Geekbench scores and GPU hardware bandwidth are retrospective fixed inputs, not measurements made at each historical date.',
        'notes': [
            'Annual late-September/October archives; dates are actual CSV Publication Date, not invented annual observation dates.',
            '2016 uses October archive to include P2 launched September 29. Earlier September archive had no current mapped GPUs.',
            'Only prices and matched hardware in archive are included, not all current machines at historical dates.',
            'p2.16xlarge historical rows with archived 768 GiB RAM are rejected against the 732 GiB benchmark mapping; exclusions remain in each snapshot.',
            'Modern scores applied to historical same-named configurations entail hardware/software/version comparability and survivorship limitations. These are retrospective AWS-only estimates, not historical multi-provider market averages.',
        ],
        'snapshots': snapshots,
    }
    save_json(project_path(args.output), result)
    print(f"Wrote {len(snapshots)} snapshots to {project_path(args.output)}")


if __name__ == '__main__':
    main()
