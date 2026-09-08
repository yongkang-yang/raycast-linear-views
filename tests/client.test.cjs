const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { buildSchema, parse, validate } = require('graphql');
const compiled = path.resolve('work/test-build');
fs.mkdirSync(compiled, { recursive: true });
for (const name of ['views', 'linear-client']) {
  fs.writeFileSync(path.join(compiled, name + '.js'), ts.transpileModule(fs.readFileSync('src/' + name + '.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
  }).outputText);
}
const { fetchView, viewQuery } = require(path.join(compiled, 'linear-client.js'));
const { viewSlug, configuredViews, currentView } = require(path.join(compiled, 'views.js'));
const url = 'https://linear.app/yongkang/view/todo-41428a79d10e';
const page = (ids, more = false, cursor = null) => ({ data: { customView: { id: 'view', name: 'ToDo', modelName: 'Issue', issues: { nodes: ids.map(id => ({id, title: id})), pageInfo: { hasNextPage: more, endCursor: cursor } } } } });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('GraphQL query validates against official Linear schema', () => {
  const schemaPath = 'work/linear-schema.graphql';
  assert.ok(fs.existsSync(schemaPath), 'Download official schema before running tests; see README.');
  const errors = validate(buildSchema(fs.readFileSync(schemaPath, 'utf8')), parse(viewQuery));
  assert.deepEqual(errors.map(e => e.message), []);
});
test('URL registry rejects wrong hosts, non-view routes, temporary filters, and incomplete slots', () => {
  assert.equal(viewSlug(url), 'todo-41428a79d10e');
  for (const bad of ['https://linear.app.evil.test/a/view/b', 'http://linear.app/a/view/b', 'https://linear.app/a/views/issues', url + '?filter=abc', 'https://user:pass@linear.app/a/view/b']) assert.throws(() => viewSlug(bad));
  const { views, errors } = configuredViews({view1Name:'ToDo', view1Url:url, view2Name:'Incomplete'});
  assert.equal(views.length, 1); assert.equal(errors.length, 1);
  assert.equal(currentView(views, 'removed', '8').url, url);
});
test('loads every page, sends native view query, deduplicates changed pages', async t => {
  const calls = [];
  t.mock.method(global, 'fetch', async (endpoint, options) => {
    calls.push(JSON.parse(options.body));
    assert.equal(endpoint, 'https://api.linear.app/graphql');
    assert.equal(options.headers.Authorization, 'test-key');
    return reply(calls.length === 1 ? page(['a', 'b'], true, 'cursor1') : page(['b', 'c']));
  });
  const result = await fetchView(url, ' test-key ', new AbortController().signal);
  assert.deepEqual(result.issues.map(i => i.id), ['a','b','c']);
  assert.deepEqual(calls.map(c => c.variables.after), [null, 'cursor1']);
  assert.equal(calls[0].variables.id, 'todo-41428a79d10e');
  assert.ok(!calls[0].query.includes('filter:'));
});
test('rejects partial GraphQL data instead of displaying an incomplete list', async t => {
  t.mock.method(global, 'fetch', async () => reply({...page(['a']), errors:[{message:'secret server details'}]}));
  await assert.rejects(fetchView(url, 'test-key', new AbortController().signal), /could not read this view/);
});
test('rejects pagination loops and does not return partial results', async t => {
  t.mock.method(global, 'fetch', async () => reply(page(['a'], true, 'same')));
  await assert.rejects(fetchView(url, 'test-key', new AbortController().signal), /pagination did not advance/);
});
test('classifies authentication and rate limits', async t => {
  const mock = t.mock.method(global, 'fetch', async () => reply({}, 401));
  await assert.rejects(fetchView(url, 'test-key', new AbortController().signal), /rejected this API key/);
  mock.mock.mockImplementation(async () => reply({}, 429));
  await assert.rejects(fetchView(url, 'test-key', new AbortController().signal), /rate limiting/);
});
test('stops aborted requests before publishing results', async t => {
  const controller = new AbortController();
  t.mock.method(global, 'fetch', async () => { controller.abort(); return reply(page(['old-view'])); });
  await assert.rejects(fetchView(url, 'test-key', controller.signal), { name:'AbortError' });
});
test('rejects non-issue views and missing credentials', async t => {
  t.mock.method(global, 'fetch', async () => { const body = page([]); body.data.customView.modelName = 'Project'; return reply(body); });
  await assert.rejects(fetchView(url, 'test-key', new AbortController().signal), /not an issue view/);
  await assert.rejects(fetchView(url, '', new AbortController().signal), /Add your Linear API Key/);
});
