const $ = id => document.getElementById(id);
let ready = false, busy = false, lastQuery = null, termRequest = 0;
const groups = ['subclasses', 'superclasses', 'equivalents'];
function controls() {
  $('run').disabled = !ready || busy;
  $('query').disabled = !ready;
  $('term-search').disabled = !ready;
  $('run').firstChild.textContent = busy ? 'Reasoning… ' : 'Run query ';
  document.querySelectorAll('[data-example]').forEach(b => b.disabled = !ready || busy);
  $('direct').disabled = busy; $('builtins').disabled = busy;
}
async function json(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
async function status() {
  try {
    const s = await json('/api/status');
    if (s.state === 'error') throw new Error(s.message);
    if (s.state !== 'ready') { $('status').textContent = '● Loading & classifying…'; setTimeout(status, 1500); return; }
    ready = true; controls();
    $('status').textContent = `● Ready · ${s.classes.toLocaleString()} classes · Whelk`;
    $('metadata').textContent = `${s.version} · ${s.logicalAxioms.toLocaleString()} logical axioms · initial load ${(s.initializationMs / 1000).toFixed(1)} s · ${s.unsatisfiableClasses} unsatisfiable named classes.`;
    const skippedCount = Object.values(s.unconvertedLogicalAxioms).reduce((a,b) => a+b, 0);
    if (skippedCount || s.axiomsWithUnconvertedExpressions) { $('scope-warning').hidden = false; $('scope-warning').textContent = `Reasoning scope: ${skippedCount} logical axioms were not translated by Whelk. See ontology details below; results may be incomplete.`; }
    const skipped = Object.entries(s.unconvertedLogicalAxioms).map(([type, count]) => `${count} ${type}`).join(', ');
    $('coverage').textContent = skipped || s.axiomsWithUnconvertedExpressions ? `Coverage notice: Whelk did not translate ${skipped || 'some nested expressions'}. ${s.axiomsWithUnconvertedExpressions} axioms contain unconverted expressions. Results are relative to supported axioms; see README for scope.` : 'Whelk translated every logical axiom in this snapshot. This is a translation check, not a proof of full OWL DL completeness.';
  } catch (e) { $('status').textContent = '● Could not initialize'; $('error').hidden = false; $('error').textContent = e.message; }
}
function clearResults(message) {
  for (const group of groups) {
    $(group + '-count').textContent = '—';
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = message; $(group).replaceChildren(li);
  }
}
async function run() {
  if (!ready || busy) return;
  busy = true; controls(); $('error').hidden = true;
  const expression = $('query').value.trim();
  $('result-status').textContent = 'Reasoning…'; $('result-query').textContent = expression; clearResults('Reasoning…');
  try {
    const data = await json('/api/query', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({expression, direct:$('direct').checked, builtins:$('builtins').checked})});
    lastQuery = expression;
    for (const group of groups) {
      $(group + '-count').textContent = data[group].length;
      $(group).replaceChildren();
      if (!data[group].length) {
        const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No matching named classes'; $(group).append(li);
      }
      for (const term of data[group]) {
        const li = document.createElement('li'), button = document.createElement('button'), id = document.createElement('small');
        button.type = 'button'; button.textContent = term.label; button.title = term.definition || term.iri;
        button.addEventListener('click', () => { if (busy) return; $('query').value = term.query; run(); });
        id.textContent = term.id; li.append(button, id); $(group).append(li);
      }
    }
    $('result-status').textContent = `${data.direct ? 'Direct' : 'All'} hierarchy results · ${data.elapsedMs} ms`;
    if (!data.satisfiable) { $('error').hidden = false; $('error').textContent = 'This expression is unsatisfiable (equivalent to owl:Nothing). Its hierarchy results should not be interpreted as ordinary anatomical matches.'; }
    if ($('query').value.trim() !== expression) $('result-status').textContent += ' · Query edited; run again';
  } catch (e) { clearResults('Query did not complete'); $('error').hidden = false; $('error').textContent = e.message; $('result-status').textContent = 'Check the expression and try again.'; }
  finally { busy = false; controls(); }
}
$('query-form').addEventListener('submit', e => {e.preventDefault(); run();});
$('query').addEventListener('keydown', e => {if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {e.preventDefault(); run();}});
$('query').addEventListener('input', () => {if (lastQuery !== null) $('result-status').textContent = 'Query edited · Run again to update results';});
for (const id of ['direct','builtins']) $(id).addEventListener('change', () => {if (lastQuery !== null) run();});
document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => {$('query').value = b.dataset.example; run();}));
let debounce;
$('term-search').addEventListener('input', () => {
  clearTimeout(debounce); const request = ++termRequest;
  debounce = setTimeout(async () => {
    try {
      const terms = await json('/api/terms?q=' + encodeURIComponent($('term-search').value));
      if (request !== termRequest) return;
      $('term-results').replaceChildren();
      for (const term of terms) {
        const li = document.createElement('li'), b = document.createElement('button'), small = document.createElement('small');
        b.type = 'button'; b.textContent = term.label; small.textContent = `${term.kind} · ${term.id}`; b.append(small);
        b.addEventListener('click', () => { const q = $('query'); q.setRangeText(term.query, q.selectionStart, q.selectionEnd, 'end'); q.focus(); q.dispatchEvent(new Event('input')); });
        li.append(b); $('term-results').append(li);
      }
      if (!terms.length) $('term-results').textContent = 'No matching terms.';
    } catch (e) { if (request === termRequest) $('term-results').textContent = e.message; }
  }, 200);
});
controls(); status();
