(() => {
  const byId=id=>document.getElementById(id), canvas=byId('mask-canvas'), ctx=canvas.getContext('2d'), viewport=byId('mask-viewport');
  let manifest, specimen, photo, annotation, masks=[], answer=null, view='all', exact=null, active=null, version=0, querying=false, failed=false;
  const loadImage=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load '+src));image.src=src;});
  const matches=m=>view==='all'||(view==='term'?m.term.iri===exact:answer?.imageMatches.some(t=>t.iri===m.term.iri));
  function draw() {
    if(!photo)return;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(photo,0,0);
    for(const m of masks){const hit=matches(m);if(m.hidden||(!hit&&!byId('mask-faint').checked))continue;ctx.globalAlpha=hit?Number(byId('mask-opacity').value):0.07;ctx.drawImage(m.layer,0,0);if(active===m.id){ctx.globalAlpha=1;ctx.strokeStyle=m.color;ctx.lineWidth=3;const b=m.bbox;ctx.strokeRect(b[0],b[1],b[2]-b[0],b[3]-b[1]);}}
    ctx.globalAlpha=1;
  }
  function render() {
    const found=masks.filter(matches), classes=new Set(found.map(m=>m.term.iri));
    byId('mask-status').textContent=`${found.length} matching masks · ${classes.size} annotated classes · ${masks.length} masks in this annotation`;
    let message=view==='all'?'Showing all annotations. Ask a question to highlight matching structures.':view==='term'?'Showing masks annotated with the selected term exactly. Return to query matches to restore the inferred selection.':`Question: ${answer.display} · ${answer.imageMatches.length} inferred matching classes. Images use all subclasses and equivalent classes, even when the answer lists show immediate matches only.`;
    if(!found.length)message+=' No annotated masks match; the photograph remains visible.';
    if(querying)message='Reasoning… Previous selection remains visible until the new answer arrives.';
    if(failed)message='The query failed. The image retains its previous selection; correct the question and try again.';
    byId('mask-question').textContent=message;
    byId('mask-query').disabled=!answer||querying;
    byId('mask-list').replaceChildren();
    for(const m of masks){const li=document.createElement('li');li.className=matches(m)?'mask-matched':'mask-unmatched';
      const check=document.createElement('input');check.type='checkbox';check.checked=!m.hidden;check.setAttribute('aria-label','Show region '+m.term.label+' '+m.regionId);check.onchange=()=>{m.hidden=!check.checked;draw();};
      const button=document.createElement('button');button.type='button';button.textContent=m.term.label+(m.name?' · '+m.name:'');button.style.borderLeftColor=m.color;button.setAttribute('aria-pressed',String(active===m.id));button.onclick=()=>select(m);
      const note=document.createElement('small');note.textContent=`${m.term.iri.split('/').pop()} · ${matches(m)?'matches':'outside selection'}${m.side.length?' · '+m.side.join(', '):''}`;
      li.append(check,button,note);byId('mask-list').append(li);
    }
    draw();
  }
  function select(m){active=m.id;render();openTerm(m.term);}
  async function setAnnotation(id){
    const request=++version;byId('mask-status').textContent='Loading annotation…';
    const next=specimen.annotations.find(a=>String(a.id)===String(id));
    try {const loaded=await Promise.all(next.masks.map(async m=>{
      const image=await loadImage('/atlas/'+m.file), layer=document.createElement('canvas');layer.width=specimen.width;layer.height=specimen.height;
      const c=layer.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);const pixels=c.getImageData(0,0,layer.width,layer.height), hit=new Uint8Array(layer.width*layer.height), rgb=m.color.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));
      for(let i=0;i<hit.length;i++){hit[i]=pixels.data[i*4]>0?1:0;pixels.data.set([...rgb,hit[i]*255],i*4);}c.putImageData(pixels,0,0);return {...m,layer,hit,hidden:false};
    }));if(request!==version)return;annotation=next;masks=loaded;active=null;
    byId('mask-notes').replaceChildren();for(const text of annotation.notes){const p=document.createElement('p');p.textContent=text;byId('mask-notes').append(p);}render();
    }catch(e){byId('mask-status').textContent=e.message;}
  }
  document.addEventListener('atlas-query-start',()=>{querying=true;failed=false;if(photo)render();});
  document.addEventListener('atlas-query-error',()=>{querying=false;failed=true;if(photo)render();});
  document.addEventListener('atlas-query-result',e=>{answer=e.detail;view='query';exact=null;active=null;querying=false;failed=false;if(photo)render();});
  // Browsing a definition preserves the query selection; this explicit action selects exact masks.
  document.addEventListener('atlas-term-loaded',e=>{const iri=e.detail.iri;
    if(e.detail.kind!=='class')return;
    const b=document.createElement('button');b.className='mask-exact-action';b.textContent='Show masks of this exact term';b.onclick=()=>{exact=iri;view='term';active=null;render();byId('mask-viewer').scrollIntoView({behavior:'smooth',block:'start'});};byId('term-detail').append(b);
  });
  byId('mask-annotation').onchange=e=>setAnnotation(e.target.value);
  byId('mask-all').onclick=()=>{view='all';active=null;failed=false;render();};byId('mask-query').onclick=()=>{view='query';active=null;render();};
  byId('mask-opacity').oninput=draw;byId('mask-faint').onchange=draw;
  function zoom(){if(!specimen)return;canvas.style.width=(Math.min(viewport.clientWidth,viewport.clientHeight*specimen.width/specimen.height)*Number(byId('mask-zoom').value))+'px';}
  new ResizeObserver(zoom).observe(viewport);byId('mask-zoom').oninput=zoom;byId('mask-reset').onclick=()=>{byId('mask-zoom').value=1;zoom();viewport.scrollTo(0,0);};
  function hits(event){const r=canvas.getBoundingClientRect(),x=Math.floor((event.clientX-r.left)*canvas.width/r.width),y=Math.floor((event.clientY-r.top)*canvas.height/r.height);return masks.filter(m=>!m.hidden&&matches(m)&&x>=0&&y>=0&&x<canvas.width&&y<canvas.height&&m.hit[y*canvas.width+x]);}
  let drag=null,moved=false;
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};moved=false;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(drag){if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>5)moved=true;if(moved){viewport.scrollLeft=drag.left-e.clientX+drag.x;viewport.scrollTop=drag.top-e.clientY+drag.y;}return;}const found=hits(e);Array.from(byId('mask-list').children).forEach((li,i)=>li.classList.toggle('mask-hovered',found.includes(masks[i])));byId('mask-hover').textContent=found.length?found.map(m=>m.term.label).join(' / ')+(found.length>1?' · Click repeatedly to cycle overlaps.':' · Click for definition.'):'Point to a coloured region or select one in the list.';});
  canvas.addEventListener('pointerup',e=>{drag=null;if(moved)return;const found=hits(e);if(found.length){const index=found.findIndex(m=>m.id===active);select(found[(index+1)%found.length]);}});canvas.addEventListener('pointercancel',()=>{drag=null;});
  (async()=>{try{manifest=await (await fetch('/atlas/manifest.json')).json();specimen=manifest.images[0];photo=await loadImage('/atlas/'+specimen.file);canvas.width=specimen.width;canvas.height=specimen.height;zoom();
    byId('mask-provenance').textContent=`${specimen.name} · ${specimen.width} × ${specimen.height} · Label Studio project ${specimen.projectId}, task ${specimen.taskId}. Ontology: ${manifest.ontologyVersion}. Original image SHA-256: ${specimen.id}.`;
    for(const a of specimen.annotations){const option=document.createElement('option');option.value=a.id;option.textContent=`${a.id} · ${a.masks.length} masks${a.id===specimen.selectedAnnotationId?' · latest':''}`;byId('mask-annotation').append(option);}byId('mask-annotation').value=specimen.selectedAnnotationId;await setAnnotation(specimen.selectedAnnotationId);
  }catch(e){byId('mask-status').textContent='Image dataset unavailable: '+e.message;}})();
})();
