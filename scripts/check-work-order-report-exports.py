"""Check actual browser downloads with standard CSV, XML and ZIP readers.

Usage: python scripts/check-work-order-report-exports.py tmp/<hosted-run>
No application export implementation is imported; no archive is extracted.
"""

import csv
import hashlib
import json
import pathlib
import sys
import xml.etree.ElementTree as ET
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def check(directory):
    expected = json.loads((directory / 'report-export-expected.json').read_text(encoding='utf-8'))
    assert expected['dataBasis'] == 'synthetic', 'This technical fixture must remain synthetic'
    source_ids = {source['id'] for source in expected['sources']}
    assert len(source_ids) == len(expected['sources']) == 2
    pdf = (directory / 'report.pdf').read_bytes()
    assert pdf.startswith(b'%PDF-') and digest(pdf) == expected['pdfSha256']
    checked = {}
    for suffix, recorded in expected['downloaded'].items():
        data = (directory / ('report.' + suffix)).read_bytes()
        assert len(data) == recorded['bytes'] and digest(data) == recorded['sha256']
    with (directory / 'report.csv').open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 2 and {row['source_id'] for row in rows} == source_ids
    for row in rows:
        assert row['report_id'] == expected['reportId']
        assert row['execution_data_basis'] == expected['dataBasis']
        assert row['execution_revision_id'] == expected['executionRevisionId']
        assert row['original_sha256'] == expected['originalSha256']
    checked['csv'] = {'sourceRows': len(rows), 'frozenClassificationAndOriginalHashes': True}

    geo = json.loads((directory / 'report.geojson').read_text(encoding='utf-8'))
    assert geo['type'] == 'FeatureCollection' and geo['report_id'] == expected['reportId']
    assert geo['execution_data_basis'] == expected['dataBasis']
    assert geo['execution_revision_id'] == expected['executionRevisionId']
    located = {source['id'] for source in expected['sources'] if source.get('position') is not None}
    assert {feature['properties']['source_id'] for feature in geo['features']} == located
    checked['geojson'] = {'features': len(located), 'noInventedPositions': True, 'frozenClassification': True}

    with zipfile.ZipFile(directory / 'report.docx') as archive:
        assert archive.testzip() is None
        document = ET.fromstring(archive.read('word/document.xml'))
        text = ''.join(document.itertext())
        assert 'Syntetiske prøvedata' in text and expected['executionRevisionId'] in text
        assert 'ikke en faktisk naturindsats' in text
    checked['docx'] = {'validZipAndXml': True, 'visibleClassificationAndExecutionSource': True}

    for suffix, include_originals in [('references.zip', False), ('originals.zip', True)]:
        with zipfile.ZipFile(directory / ('report.' + suffix)) as archive:
            names = archive.namelist()
            assert len(names) == len(set(names)), 'Duplicate ZIP names'
            assert archive.testzip() is None, 'ZIP CRC validation failed'
            manifest = json.loads(archive.read('manifest.json'))
            assert manifest['schema'] == 'freyra.work-order-report-package/v2'
            assert manifest['reportId'] == expected['reportId']
            assert manifest['revisionId'] == expected['revisionId']
            entries = manifest['files']
            assert {item['name'] for item in entries} == set(names) - {'manifest.json'}
            assert len(entries) == len(names) - 1
            for entry in entries:
                data = archive.read(entry['name'])
                assert len(data) == entry['bytes'] and digest(data) == entry['sha256']
            revision = json.loads(archive.read('rapportversion.json'))
            assert revision['id'] == expected['revisionId']
            assert revision['report_id'] == expected['reportId']
            assert revision['content']['workOrderApproval'] == expected['approval']
            assert json.loads(archive.read('inputversioner.json')) == expected['approval']
            assert json.loads(archive.read('originalreferencer.json')) == expected['sources']
            assert archive.read('rapport.pdf') == pdf, 'The ZIP PDF must match the standalone download'
            readme = archive.read('LAES_MIG.txt').decode('utf-8')
            assert 'Syntetiske prøvedata' in readme and expected['executionRevisionId'] in readme
            originals = [name for name in names if name.startswith('originaler/')]
            assert len(originals) == (len(source_ids) if include_originals else 0)
            if include_originals:
                assert {pathlib.PurePosixPath(name).stem for name in originals} == {
                    source_id.removeprefix('task-original:') for source_id in source_ids
                }
                for name in originals:
                    assert digest(archive.read(name)) == expected['originalSha256']
        checked[suffix] = {
            'validZipAndAllManifestChecksums': True,
            'frozenClassificationAndExecutionSource': True,
            'pdfMatchesStandalone': True,
            'originals': len(originals),
        }
    result = {
        'schema': 'freyra.work-order-browser-export-check/v1',
        'result': 'PASS',
        'reportId': expected['reportId'],
        'revisionId': expected['revisionId'],
        'executionRevisionId': expected['executionRevisionId'],
        'executionDataBasis': expected['dataBasis'],
        'formats': checked,
        'physicalPhoneAccepted': False,
    }
    (directory / 'report-export-check.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    check(pathlib.Path(sys.argv[1]).resolve())
