#!/usr/bin/env python3
"""Read-only Label Studio import. Requires Pillow. Source RLE specification:
https://github.com/HumanSignal/label-studio-converter/blob/master/label_studio_converter/brush.py
Only brushlabels define geometry; taxonomy/metadata join by region ID.
"""
import argparse, hashlib, json, xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

PALETTE=['#36b9e5','#f2a541','#ab78ef','#64d685','#ed7298','#e6d34b','#ed754b','#7dd3c7']

def decode(rle, expected):
    if not isinstance(rle,list) or any(type(v) is not int or not 0<=v<=255 for v in rle): raise ValueError('Invalid RLE bytes')
    bits=''.join(f'{v:08b}' for v in rle); cursor=0
    def take(n):
        nonlocal cursor
        if cursor+n>len(bits): raise ValueError('Truncated RLE')
        value=int(bits[cursor:cursor+n],2);cursor+=n;return value
    length=take(32);word=take(5)+1;sizes=[take(4)+1 for _ in range(4)]
    if length!=expected or word!=8: raise ValueError('Unexpected RLE dimensions or word size')
    out=bytearray()
    while len(out)<length:
        repeated=take(1);count=take(sizes[take(2)])+1
        if len(out)+count>length: raise ValueError('RLE overrun')
        if repeated: out.extend(bytes([take(word)])*count)
        else: out.extend(take(word) for _ in range(count))
    return bytes(out)

def convert(source,image_path,owl_path,out):
    tasks=json.loads(source.read_text())
    if len(tasks)!=1: raise ValueError('Provide one task per image for this importer')
    task=tasks[0]; original=image_path.read_bytes();image=Image.open(image_path);image.load();w,h=image.size
    if image.getexif().get(274,1)!=1: raise ValueError('Normalize image orientation before annotation')
    root=ET.parse(owl_path).getroot();about='{http://www.w3.org/1999/02/22-rdf-syntax-ns#}about'
    ns={'owl':'http://www.w3.org/2002/07/owl#','rdfs':'http://www.w3.org/2000/01/rdf-schema#'}
    terms={c.get(about): next((n.text for n in c.findall('rdfs:label',ns)),c.get(about)) for c in root.findall('owl:Class',ns)}
    version=root.find('owl:Ontology/owl:versionIRI',ns).get('{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource')
    annotations=[];files={};colors={};unknown=set()
    for ann in task.get('annotations',[]):
        if ann.get('was_cancelled'): continue
        masks=[];seen=set();results=ann.get('result',[])
        for region in results:
            if region.get('type')!='brushlabels' or region.get('from_name')!='mask':continue
            rid=region['id']
            if rid in seen: raise ValueError('Duplicate brush region ID within annotation')
            seen.add(rid)
            if (region['original_width'],region['original_height'])!=(w,h) or region.get('image_rotation',0)!=0:raise ValueError('Mask alignment mismatch')
            linked=[r for r in results if r.get('id')==rid]
            paths=[p for r in linked if r.get('from_name')=='anatomy' for p in r.get('value',{}).get('taxonomy',[])]
            if len(paths)!=1 or not paths[0]:raise ValueError('Expected one ontology term per mask')
            iri=paths[0][-1]
            if not iri.startswith(('http://','https://')):raise ValueError('Expected full ontology IRI')
            if iri not in terms:unknown.add(iri)
            value=region['value']
            if value.get('format')!='rle':raise ValueError('Expected Label Studio RLE')
            rgba=decode(value['rle'],w*h*4);alpha=bytes(255 if v else 0 for v in rgba[3::4])
            mask=Image.frombytes('L',(w,h),alpha);bbox=mask.getbbox()
            if bbox is None:raise ValueError('Empty mask')
            stable=f"project-{task['project']}:task-{task['id']}:annotation-{ann['id']}:{rid}"
            filename='mask-'+hashlib.sha256(stable.encode()).hexdigest()[:20]+'.png';files[filename]=mask
            if rid not in colors:colors[rid]=PALETTE[len(colors)%len(PALETTE)]
            def values(name,key):return [v for r in linked if r.get('from_name')==name for v in r.get('value',{}).get(key,[])]
            masks.append({'id':stable,'regionId':rid,'term':{'iri':iri,'label':terms.get(iri,iri),'known':iri in terms},'file':filename,'color':colors[rid], 'name':' '.join(values('instance_name','text')),'side':values('side','choices'),'pixels':sum(v>0 for v in alpha),'bbox':bbox,'reviewStatus':'unspecified'})
        if masks:annotations.append({'id':ann['id'],'updatedAt':ann.get('updated_at'),'notes':[t for r in results if r.get('from_name')=='notes' for t in r.get('value',{}).get('text',[])],'masks':masks})
    if not annotations:raise ValueError('No submitted masks')
    selected=max(annotations,key=lambda a:(a['updatedAt'] or '',a['id']))['id']
    manifest={'format':'anatomy-atlas-masks','version':1,'ontologyVersion':version,'ontologySha256':hashlib.sha256(owl_path.read_bytes()).hexdigest(),'sourceExport':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'unknownTerms':sorted(unknown),'images':[{'id':hashlib.sha256(original).hexdigest(),'name':image_path.name,'originalFormat':image.format,'file':'image.png','width':w,'height':h,'projectId':task['project'],'taskId':task['id'],'sourceImageReference':task['data']['image'],'selectedAnnotationId':selected,'annotations':annotations}]}
    out.mkdir(parents=True,exist_ok=False)
    image.convert('RGB').save(out/'image.png')
    for filename,mask in files.items():mask.save(out/filename)
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'annotations':[(a['id'],len(a['masks'])) for a in annotations],'selected':selected,'unknownTerms':sorted(unknown)}))
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('export',type=Path);p.add_argument('--image',type=Path,required=True);p.add_argument('--ontology',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();convert(a.export,a.image,a.ontology,a.output)
