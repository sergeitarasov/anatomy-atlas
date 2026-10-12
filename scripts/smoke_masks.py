"""Live AISM/mask matching regression checks; run with the server listening."""
import json, os, urllib.request
base=os.environ.get('ATLAS_URL','http://127.0.0.1:8787')
manifest=json.load(urllib.request.urlopen(base+'/atlas/manifest.json'))
image=manifest['images'][0]
masks=next(a['masks'] for a in image['annotations'] if a['id']==image['selectedAnnotationId'])
for expression,expected in [('pronotum',['pronotum','pronotum']),('tibia',['metatibia']),('antenna',[])]:
    for direct in [False,True]:
        request=urllib.request.Request(base+'/api/query',data=json.dumps(dict(expression=expression,direct=direct)).encode(),headers={'Content-Type':'application/json'})
        response=json.load(urllib.request.urlopen(request))
        iris={t['iri'] for t in response['imageMatches']}
        found=[m['term']['label'] for m in masks if m['term']['iri'] in iris]
        assert found==expected,(expression,direct,found)
        print(expression,'direct='+str(direct),found)
for mask in masks:
    response=urllib.request.urlopen(base+'/atlas/'+mask['file'])
    assert response.headers.get_content_type()=='image/png'
    assert response.read(8)==b'\x89PNG\r\n\x1a\n'
print('Image matching and asset checks passed.')
