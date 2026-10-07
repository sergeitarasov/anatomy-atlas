#!/usr/bin/env python3
"""Integration checks against a running AISM server; standard library only."""
import json
import os
import urllib.request
import urllib.error

BASE = os.environ.get('ATLAS_URL', 'http://127.0.0.1:8787')

def query(expression, **options):
    request = urllib.request.Request(BASE + '/api/query', data=json.dumps(dict(expression=expression, **options)).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def ids(result, group):
    return {term['id'] for term in result[group]}

with urllib.request.urlopen(BASE + '/api/status') as response:
    status = json.load(response)
assert status['state'] == 'ready', status
assert status['classes'] == 8614, 'Unexpected snapshot; update expectations deliberately.'

tibia = query('tibia')
assert ids(tibia, 'subclasses') == {'AISM:0000067', 'AISM:0000068', 'AISM:0000069'}
assert ids(tibia, 'equivalents') == {'AISM:0000075'}
assert ids(query('AISM:0000075'), 'subclasses') == ids(tibia, 'subclasses')
assert ids(query('<http://purl.obolibrary.org/obo/AISM_0000075>'), 'superclasses') == ids(tibia, 'superclasses')
parts = query("'part of' some 'insect leg'")
assert 'AISM:0000075' in ids(parts, 'subclasses'), 'Tibia should be inferred to be part of a leg.'
assert 'AISM:0000067' in ids(parts, 'subclasses'), 'Inherited leg-part inference missing.'
direct = query("'part of' some 'insect leg'", direct=True)
assert ids(direct,'subclasses') < ids(parts,'subclasses')
assert ids(query("part_of some AISM:0000031"),'subclasses') == ids(parts,'subclasses')
for expr in ["tibia and", "'part of' some", "no_such_anatomy", "not tibia", "tibia or 'insect leg'"]:
    try:
        query(expr)
        raise AssertionError('Expected rejection: ' + expr)
    except urllib.error.HTTPError as error:
        assert error.code == 400, (expr, error.code, error.read())
for group in ('subclasses','superclasses','equivalents'):
    assert ids(query('tibia'),group) == ids(tibia,group), 'Query state leaked.'
print(json.dumps({'status':'passed', 'classes':status['classes'], 'tibiaSubclasses':len(tibia['subclasses']), 'legPartSubclasses':len(parts['subclasses']), 'directLegPartSubclasses':len(direct['subclasses']), 'legPartQueryMs':parts['elapsedMs']}, indent=2))
