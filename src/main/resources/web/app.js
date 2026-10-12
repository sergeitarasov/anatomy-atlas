const $ = id => document.getElementById(id);
const groups = ['subclasses','superclasses','equivalents'];
const partIRI = 'http://purl.obolibrary.org/obo/BFO_0000050', hasIRI = 'http://purl.obolibrary.org/obo/BFO_0000051';
let ready=false, busy=false, mode='guided', selected=null, guidedSnapshot='', lastQuery=null, detailVersion=0;
const history=[];
async function json(url, options) {
  const response=await fetch(url,options), data=await response.json();
  if(!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function el(tag,text,className) {const e=document.createElement(tag); if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function controls() {
  document.querySelectorAll('[data-ready], [data-lesson], [data-insert]').forEach(e=>e.disabled=!ready || busy);
  $('run').disabled=!ready||busy; $('run').textContent=busy?'Finding answers…':'Explore answers ↗';
  $('guided-mode').disabled=busy; $('editor-mode').disabled=busy;
  document.querySelector('.results').setAttribute('aria-busy',String(busy));
}
function dirty() {if(lastQuery!==null)$('result-status').textContent='Question changed · Explore again to update answers';}
function showError(message) {
  let friendly=message;
  if(/some\s*$/.test($('query').value)) friendly='Choose the structure that this relationship points to—for example, insect leg. Type a name after “some”, then choose a suggestion.';
  else if(/and\s*$/.test($('query').value)) friendly='“And” joins two conditions. Add another class or relationship after it.';
  else if(/Encountered|Expected|Unexpected|Invalid/.test(message)) friendly='We could not read this expression. Check the term spelling, quotes and parentheses, or use a suggested term.';
  $('error').hidden=false;$('friendly-error').textContent=friendly;$('technical-error').textContent=message;
}
function setMode(next) {
  mode=next;$('guided-panel').hidden=mode!=='guided';$('editor-panel').hidden=mode!=='editor';
  $('guided-mode').setAttribute('aria-pressed',String(mode==='guided'));$('editor-mode').setAttribute('aria-pressed',String(mode==='editor'));
  $('mode-note').hidden=true;
}
function guidedExpression(canonical=false) {
  if(!selected) return '';
  const term=canonical?selected.query:selected.expression, rel=$('relationship').value;
  return rel==='kind'?term:`${canonical?'<'+(rel==='part'?partIRI:hasIRI)+'>':rel==='part'?"'part of'":"'has part'"} some ${term}`;
}
function updateGuided() {
  if(!selected) {$('generated').textContent='Choose a term from the suggestions.';return;}
  guidedSnapshot=guidedExpression();$('generated').textContent=guidedSnapshot;$('query').value=guidedSnapshot;
  $('selection-help').textContent=`Selected: ${selected.label} · ${selected.id}`;
  const rel=$('relationship').value;
  $('translation-help').textContent=rel==='kind'?`Find categories that are kinds of ${selected.label}. This is a “kind of” relationship, not a “part of” relationship.`:rel==='part'?`“some” means “at least one”. Find structures that are part of at least one ${selected.label}.`:`“some” means “at least one”. Find structures containing at least one part that is a ${selected.label}.`;
  dirty();
}
async function findTerm(name,kind='class') {
  const terms=await json('/api/terms?q='+encodeURIComponent(name.replace(/^<|>$/g,''))+'&kind='+kind);
  return terms.find(t=>t.label===name||t.iri===name.replace(/^<|>$/g,'')||t.id===name||t.query===name);
}
async function switchToGuided() {
  if(mode==='guided')return;
  if(selected && $('query').value===guidedSnapshot){setMode('guided');return;}
  const text=$('query').value.trim();
  const match=text.match(/^(?:(('part of'|part_of|<http:\/\/purl.obolibrary.org\/obo\/BFO_0000050>|'has part'|<http:\/\/purl.obolibrary.org\/obo\/BFO_0000051>))\s+some\s+)?('[^']+'|<[^>]+>|[\w:-]+)$/);
  if(match) {
    try {
      const term=await findTerm(match[3].replace(/^'|'$/g,''));
      if(term){selected=term;$('structure').value=term.label;$('relationship').value=!match[1]?'kind':match[1].includes('has part')||match[1].includes('0000051')?'has':'part';updateGuided();setMode('guided');return;}
    }catch(e){showError(e.message);return;}
  }
  $('mode-note').hidden=false;$('mode-note').textContent='This expression has more detail than the guided builder supports. It is preserved in the editor. Choose a guided exploration below to start another question.';
}
function editorContext() {
  const input=$('query'), pos=input.selectionStart, value=input.value;
  const tokenPattern=/<[^>]*>?|'(?:\\.|[^'\\])*'?|[A-Za-z0-9_:-]+/g;
  let match, token=null;
  while((match=tokenPattern.exec(value))) {if(match.index<=pos&&pos<=match.index+match[0].length){token=match;break;}}
  const start=token?token.index:pos,end=token?token.index+token[0].length:pos;
  let text=value.slice(start,pos).replace(/^['<]/,'').replace(/['>]$/,'');
  const before=value.slice(0,start), after=value.slice(end);
  if(['some','and'].includes(text))text='';
  return {text,start,end,kind:/\bsome\s*\(?\s*$/.test(before)?'class':/^\s+some\b/.test(after)?'property':'', before,after};
}
function autocomplete(inputId,listId,context,onPick) {
  const input=$(inputId),list=$(listId);let items=[],active=-1,timer,version=0,range;
  function close(){version++;clearTimeout(timer);list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function activate(index){active=(index+items.length)%items.length;Array.from(list.children).forEach((li,i)=>li.setAttribute('aria-selected',String(i===active)));input.setAttribute('aria-activedescendant',`${listId}-${active}`);list.children[active]?.scrollIntoView({block:'nearest'});}
  function pick(index){const t=items[index];if(!t)return;close();onPick(t,range);}
  function schedule(){clearTimeout(timer);const current=++version;timer=setTimeout(async()=>{
    if(!ready||busy)return;range=context();
    if(!range.text.trim()){close();return;}
    try {
      const found=await json('/api/terms?q='+encodeURIComponent(range.text)+'&kind='+range.kind);
      if(current!==version||document.activeElement!==input)return;
      items=found.slice(0,10);active=-1;list.replaceChildren();
      if(!items.length){list.append(el('li','No matching terms. Try another name or identifier.','hint'));}
      items.forEach((t,i)=>{const li=el('li');li.id=`${listId}-${i}`;li.setAttribute('role','option');li.setAttribute('aria-selected','false');li.append(el('strong',t.label),el('small',`${t.kind==='class'?'Anatomical category':'Relationship'} · ${t.id}`));if(t.definition)li.append(el('span',t.definition.slice(0,190)+(t.definition.length>190?'…':''),'definition-preview'));li.addEventListener('mousedown',e=>e.preventDefault());li.addEventListener('click',()=>pick(i));list.append(li);});
      list.hidden=false;input.setAttribute('aria-expanded','true');
    }catch(e){if(current===version){list.replaceChildren(el('li','Term search unavailable. '+e.message,'hint'));list.hidden=false;}}
  },180);}
  input.addEventListener('input',schedule);input.addEventListener('focus',schedule);input.addEventListener('click',schedule);
  input.addEventListener('keydown',e=>{
    if(['Escape','ArrowLeft','ArrowRight'].includes(e.key)){close();return;}
    if(list.hidden||!items.length)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();activate(active<0?(e.key==='ArrowDown'?0:items.length-1):active+(e.key==='ArrowDown'?1:-1));}
    if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();e.stopImmediatePropagation();pick(active<0?0:active);}
  });
  input.addEventListener('blur',close);return {close};
}
autocomplete('structure','structure-options',()=>({text:$('structure').value,kind:'class'}),t=>{selected=t;$('structure').value=t.label;updateGuided();openTerm(t);});
autocomplete('term-search','explorer-options',()=>({text:$('term-search').value,kind:''}),t=>{$('term-search').value=t.label;openTerm(t);});
autocomplete('query','query-options',editorContext,(t,range)=>{const input=$('query');let text=t.expression;if(t.kind==='property'&&!/^\s+some\b/.test(range.after))text+=' some ';input.setRangeText(text,range.start,range.end,'end');dirty();});
$('structure').addEventListener('input',()=>{selected=null;updateGuided();$('selection-help').textContent='Choose a suggestion to confirm the term.';dirty();});
$('relationship').addEventListener('change',updateGuided);
$('guided-mode').addEventListener('click',switchToGuided);$('editor-mode').addEventListener('click',()=>setMode('editor'));
$('query').addEventListener('input',dirty);
document.querySelectorAll('[data-insert]').forEach(b=>{for(const event of ['focus','mouseenter'])b.addEventListener(event,()=>{$('operator-help').textContent=b.title;});b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>{const q=$('query'),start=q.selectionStart,selection=q.value.slice(q.selectionStart,q.selectionEnd);q.setRangeText(b.dataset.insert==='()'?'('+selection+')':b.dataset.insert,q.selectionStart,q.selectionEnd,'end');if(b.dataset.insert==='()')q.setSelectionRange(start+1,start+1+selection.length);q.focus();dirty();});});
function clearResults(message) {for(const g of groups){$(g+'-count').textContent='—';$(g).replaceChildren(el('li',message,'empty'));}}
function termButton(term){const b=el('button',term.label,'term-link');b.type='button';b.addEventListener('click',()=>openTerm(term));return b;}
function remember(expression,display,direct,builtins) {
  const existing=history.findIndex(h=>h.expression===expression&&h.direct===direct&&h.builtins===builtins);if(existing>=0)history.splice(existing,1);
  history.unshift({expression,display,direct,builtins});history.splice(8);$('history-panel').hidden=false;$('history').replaceChildren();
  history.forEach(h=>{const li=el('li'),b=el('button',h.display+(h.direct?' · immediate matches':''));b.type='button';b.addEventListener('click',()=>{if(busy)return;setMode('editor');$('query').value=h.expression;$('direct').checked=h.direct;$('builtins').checked=h.builtins;run();});li.append(b);$('history').append(li);});
}
async function run() {
  if(!ready||busy)return;
  if(mode==='guided'&&!selected){showError('Select an anatomical term from the suggestions before exploring.');$('structure').focus();return;}
  const expression=mode==='guided'?guidedExpression(true):$('query').value.trim(),display=mode==='guided'?guidedSnapshot:expression;
  const direct=$('direct').checked,builtins=$('builtins').checked;
  document.dispatchEvent(new CustomEvent('atlas-query-start'));
  busy=true;controls();$('error').hidden=true;$('result-status').textContent='Finding inferred answers…';$('result-query').textContent=display;clearResults('Reasoning…');
  try {
    const data=await json('/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expression,direct,builtins})});lastQuery=expression;document.dispatchEvent(new CustomEvent('atlas-query-result',{detail:{...data,display}}));
    for(const g of groups){$(g+'-count').textContent=data[g].length;$(g).replaceChildren();if(!data[g].length)$(g).append(el('li','No matching named categories','empty'));for(const term of data[g]){const li=el('li');li.append(termButton(term),el('small',term.id));$(g).append(li);}}
    $('result-status').textContent=`${direct?'Immediate':'All'} matches · ${data.elapsedMs} ms`;
    if(!data.satisfiable)showError('These conditions cannot hold together under the supported axioms (equivalent to owl:Nothing). Do not interpret these as ordinary anatomical matches.');
    remember(expression,display,direct,builtins);
  }catch(e){document.dispatchEvent(new CustomEvent('atlas-query-error'));clearResults('Question could not be answered');showError(e.message);$('result-status').textContent='Check your question and try again.';}
  finally{busy=false;controls();}
}
$('query-form').addEventListener('submit',e=>{e.preventDefault();run();});
$('query-form').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();run();}});
for(const id of ['direct','builtins'])$(id).addEventListener('change',()=>{if(lastQuery!==null)run();});
async function askAbout(term,relation) {
  if(busy)return;
  selected=term;$('structure').value=term.label;$('relationship').value=relation;updateGuided();setMode('guided');await run();
}
async function openTerm(term) {
  document.dispatchEvent(new CustomEvent("atlas-term",{detail:term}));
  const request=++detailVersion, panel=$('term-detail');panel.replaceChildren(el('p','Loading term…','hint'));
  try {
    const data=await json('/api/term?iri='+encodeURIComponent(term.iri));if(request!==detailVersion)return;
    panel.replaceChildren(el('p',data.kind==='class'?'ANATOMICAL CATEGORY':'RELATIONSHIP','eyebrow'),el('h2',data.label),el('small',data.id));
    panel.append(el('h3','Ontology definition'),el('blockquote',data.definition||'No definition is supplied in this ontology snapshot.'));
    const source=el('a','Source: AISM ontology snapshot');source.href=data.source;source.target='_blank';source.rel='noreferrer';panel.append(source);
    if(data.synonyms.length)panel.append(el('h3','Other names in the ontology'),el('p',data.synonyms.join('; ')),el('p','Synonyms can be exact, broader, narrower or related; they are search aids, not necessarily equivalent classes.','hint'));
    const actions=el('div',undefined,'detail-actions');
    function action(label,fn){const b=el('button',label);b.type='button';b.addEventListener('click',fn);actions.append(b);}
    action('Use in query',()=>{if(busy)return;if(mode==='guided'&&data.kind==='class'){selected=data;$('structure').value=data.label;updateGuided();}else{setMode('editor');const q=$('query');q.setRangeText(data.expression+(data.kind==='property'?' some ':''),q.selectionStart,q.selectionEnd,'end');q.focus();dirty();}});
    if(data.kind==='class'){action('Find its parts',()=>askAbout(data,'part'));action('Find structures containing it',()=>askAbout(data,'has'));}
    panel.append(actions);
    document.dispatchEvent(new CustomEvent("atlas-term-loaded",{detail:data}));
    if(data.kind==='class') {
      for(const [key,title] of [['parents','Kinds of · inferred broader categories'],['children','More specific kinds · inferred']]){panel.append(el('h3',title));const list=el('ul');for(const t of data[key]){const li=el('li');li.append(termButton(t));list.append(li);}if(!data[key].length)list.append(el('li','None shown.','hint'));panel.append(list);}
      panel.append(el('h3','Relationships stated in the ontology'));
      for(const r of data.relationships){const row=el('div',undefined,'relation');row.append(el('span',`${data.label} → ${r.property.label} → `),termButton(r.target),el('small','some · at least one related structure'));panel.append(row);}
      if(!data.relationships.length)panel.append(el('p','No simple named-target relationships are stated directly for this class. Others may be inherited or expressed in more complex axioms.','hint'));
      panel.append(el('p','These are directly asserted existential relationships, not a proof of why a query matched.','hint'));
    }
  }catch(e){if(request===detailVersion)panel.replaceChildren(el('p',e.message));}
}
document.querySelectorAll('[data-lesson]').forEach(button=>button.addEventListener('click',async()=>{
  if(!ready||busy)return;try{
    $('lesson-tip').hidden=false;
    const leg=await findTerm('insect leg');
    if(button.dataset.lesson==='parts'){$('lesson-tip').textContent='Look for tibia in the answers, or search for it in the anatomy explorer. Open its definition and compare its more specific kinds.';await askAbout(leg,'part');}
    if(button.dataset.lesson==='kinds'){$('lesson-tip').textContent='These are kinds of legs. Now change “are a kind of” to “are part of” and explore again. A hind leg is a kind of leg; a tibia is a part of a leg. Both questions stay in Recent questions.';await askAbout(leg,'kind');}
    if(button.dataset.lesson==='combine'){$('lesson-tip').textContent='“And” requires both conditions: the structure must be an appendage segment and part of an insect leg. Compare this with the broader leg-parts question.';setMode('editor');$('query').value="'appendage segment' and ('part of' some 'insect leg')";await run();}
  }catch(e){showError(e.message);}
}));
async function status() {
  try {
    const s=await json('/api/status');if(s.state==='error')throw new Error(s.message);
    if(s.state!=='ready'){$('status').textContent='● Loading & classifying…';setTimeout(status,1500);return;}
    $('status').textContent=`● Ready · ${s.classes.toLocaleString()} classes · Whelk`;
    $('metadata').textContent=`${s.version} · ${s.logicalAxioms.toLocaleString()} logical axioms · ${(s.initializationMs/1000).toFixed(1)} s initialization · ${s.unsatisfiableClasses} unsatisfiable named classes.`;
    const count=Object.values(s.unconvertedLogicalAxioms).reduce((a,b)=>a+b,0);
    if(count||s.axiomsWithUnconvertedExpressions){$('scope-warning').hidden=false;$('scope-warning').textContent=`Reasoning scope: ${count} logical axioms were not translated by Whelk. Answers may be incomplete; see ontology details below.`;}
    $('coverage').textContent=`Untranslated logical axioms: ${JSON.stringify(s.unconvertedLogicalAxioms)}. ${s.axiomsWithUnconvertedExpressions} axioms contain untranslated expressions (counts overlap). Translation does not establish full OWL DL completeness.`;
    selected=await findTerm('insect leg');if(!selected)throw new Error('The example term insect leg was not found.');updateGuided();ready=true;controls();
    const linkedTerm=new URLSearchParams(location.search).get("term");if(linkedTerm)await openTerm({iri:linkedTerm});
  }catch(e){$('status').textContent='● Could not initialize';showError(e.message);}
}
controls();status();
