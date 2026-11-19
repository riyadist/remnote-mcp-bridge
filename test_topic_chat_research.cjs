const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('./topic-chat-research.cjs');
const payload = { sceneContext: { mediaTitle: 'Example Show (2020) - S02E02', timestamp: '00:05:32',
  currentSubtitle: "It's like reciprocal respect going on. I knew it." } };
const req = r.researchRequest(payload, 'scene_explanation', false);
const source = { url: 'https://example.org/transcript/2', title: 'Example Show 02x02',
  quote: "It's like reciprocal respect going on", timestamp: '00:05:31' };
const telemetry = () => ({ calls: 2, opened: new Set([source.url]) });

test('conversational research accepts normal broad answer and only opened source links', () => {
  const result = r.parseConversationAnswer(`Scene explanation. [Episode source](${source.url}) [Unopened](https://example.org/fake)`,req,telemetry());
  assert.equal(result.researchStatus,'researched');
  assert.deepEqual(result.sources,[{url:source.url,title:'Episode source'}]);
  assert.doesNotMatch(result.answer,/https:\/\/example.org\/fake/);
  assert.doesNotMatch(result.answer,/Unopened/);
  assert.match(r.conversationResearchInstructions(),/Ayni sahnenin devamindaki/);
  assert.match(r.conversationResearchInstructions(),/zorunlu onkosulu DEGILDIR/);
  assert.match(r.conversationResearchInstructions(),/JSON yazma/);
  assert.equal(r.parseConversationAnswer('Known episode context',req,{calls:0,opened:new Set()}).researchStatus,'model_knowledge');
});

test('research is scoped to named productions and useful dialogue; never quick or lexical', () => {
  assert.ok(req);
  for (const intent of ['lexical', 'world_knowledge', 'general']) assert.equal(r.researchRequest(payload, intent, false), null);
  assert.equal(r.researchRequest(payload, 'scene_explanation', true), null);
  assert.equal(r.researchRequest({ sceneContext: { ...payload.sceneContext, mediaTitle: '1' } }, 'scene_identity', false), null);
  assert.equal(r.researchRequest({ sceneContext: { ...payload.sceneContext, currentSubtitle: '[stammers]' } }, 'scene_identity', false).matchingMode, 'episode_time');
});

test('Congratulations with short dialogue keeps scene research and strict episode/time evidence', () => {
  const request = r.researchRequest({sceneContext:{mediaTitle:'Example Show S01E03',timestamp:'00:04:36',
    currentSubtitle:'Congratulations.',previousSubtitles:Array.from({length:23},() => ({text:'Thank you.'}))}},'scene_explanation',false);
  assert.equal(request.matchingMode,'episode_time');
  const temporal = {...source,title:'Example Show S01E03',timestamp:'00:04:36'};
  assert.equal(r.sourceMatches(temporal,request,telemetry()),true);
  for (const patch of [{timestamp:''},{timestamp:'00:02:36'},{title:'Example Show S01E02'}])
    assert.equal(r.sourceMatches({...temporal,...patch},request,telemetry()),false);
  assert.equal(r.sourceMatches(temporal,request,{calls:0,opened:new Set()}),false);
  assert.match(r.researchInstructions(request),/Girdi zamanini kaynak zamani diye kopyalama/);
});

test('longer prior cue beyond last8 is retained; untimed unidentified short scene is not researched', () => {
  const previous = [{timestamp:'00:04:00',text:'This is a distinctive earlier sentence'},
    ...Array.from({length:12},() => ({text:'Yes.'}))];
  const request = r.researchRequest({sceneContext:{mediaTitle:'Example Show S01E03',timestamp:'00:04:36',
    currentSubtitle:'Congratulations.',previousSubtitles:previous}},'scene_explanation',false);
  assert.equal(request.matchingMode,'dialogue');
  assert.equal(request.anchors[0],previous[0].text);
  assert.equal(r.researchRequest({sceneContext:{mediaTitle:'Example Show',currentSubtitle:'Okay.'}},'scene_explanation',false),null);
});

test('accept only opened source with production/episode/quote/time alignment', () => {
  assert.equal(r.sourceMatches(source, req, telemetry()), true);
  for (const patch of [{title:'Example Show 02x03'}, {title:'Different Show 02x02'},
    {quote:'This is a completely unrelated quote'}, {timestamp:'00:09:00'}, {url:'https://example.org/not-opened'},
    {quote:'I knew it'}]) assert.equal(r.sourceMatches({...source,...patch},req,telemetry()),false,JSON.stringify(patch));
  assert.equal(r.sourceMatches(source,req,{calls:0,opened:new Set([source.url])}),false);
});

test('actual web events count opens; starting/searching without opening is not sufficient', () => {
  const t = { calls: 0, opened: new Set() };
  r.observeSearchEvent({type:'item.started',item:{type:'web_search',action:{type:'open_page',url:source.url}}},t);
  assert.equal(t.calls,0);
  r.observeSearchEvent({type:'item.completed',item:{type:'web_search',action:{type:'search',query:'Example'}}},t);
  assert.equal(r.sourceMatches(source,req,t),false);
  r.observeSearchEvent({type:'item.completed',item:{type:'web_search',action:{type:'open_page',url:source.url}}},t);
  assert.equal(r.sourceMatches(source,req,t),true);
  const currentCli = {calls:0,opened:new Set()};
  r.observeSearchEvent({type:'item.completed',item:{type:'web_search',query:source.url,action:{type:'other'}}},currentCli);
  assert.equal(r.sourceMatches(source,req,currentCli),true);
});

test('unmatched or malformed research never leaks the researched answer or source', () => {
  const json = JSON.stringify({answer:'UNVERIFIED NAME',localAnswer:'Only local dialogue',source:{...source,title:'Wrong show'}});
  const result = r.parseResearchAnswer(json,req,telemetry());
  assert.doesNotMatch(result.answer,/Only local dialogue|UNVERIFIED/);
  assert.equal(result.researchStatus,'unmatched');
  assert.deepEqual(result.sources,[]);
  assert.doesNotMatch(r.parseResearchAnswer('UNVERIFIED NAME',req,telemetry()).answer,/UNVERIFIED/);
  assert.equal(r.parseResearchAnswer('null',req,telemetry()).researchStatus,'unmatched');
  assert.equal(r.parseResearchAnswer(JSON.stringify({source,answer:''}),req,telemetry()).researchStatus,'unmatched');
});

test('matched answer exposes its source, instructions prevent full transcripts and spoilers', () => {
  const result = r.parseResearchAnswer(JSON.stringify({answer:'Grounded explanation',localAnswer:'Local',source}),req,telemetry());
  assert.equal(result.researchStatus,'matched');
  assert.equal(result.sources[0].url,source.url);
  const prompt = r.researchInstructions(req);
  assert.match(prompt,/sayfasini AC/);
  assert.match(prompt,/Sonraki sahnelerin olaylarini kullanma/);
  assert.match(prompt,/en fazla 25 kelime/);
  assert.match(prompt,/goruntusunu arama motoruna gonderme/);
});

test('previous quote uses its own timestamp, not the clicked Okay timestamp', () => {
  const request = r.researchRequest({sceneContext: {...payload.sceneContext,
    timestamp:'00:25:24', currentSubtitle:'Okay.', previousSubtitles:[
      {timestamp:'00:24:52',text:'I just think this is a convenient condition'},
      {timestamp:'00:25:13',text:'I need time.'},
    ]}}, 'scene_explanation', false);
  const earlier = {...source,quote:'I just think this is a convenient condition',timestamp:'00:24:52'};
  assert.equal(r.sourceMatches(earlier,request,telemetry()),true);
  assert.equal(r.sourceMatches({...earlier,timestamp:'00:18:52'},request,telemetry()),false);
  assert.match(r.researchInstructions(request),/00:24:52/);
});

test('future anchors excluded, untimed previous anchor never inherits click time', () => {
  const request = r.researchRequest({sceneContext:{...payload.sceneContext,
    previousSubtitles:[{timestamp:'00:09:00',text:'This future dialogue is not evidence'},
      {text:'This earlier quote has no local timestamp'}]}},'scene_explanation',false);
  assert.equal(request.anchors.length,2);
  assert.equal(request.anchorRecords[1].timestamp,'');
  assert.equal(r.sourceMatches({...source,quote:'This earlier quote has no local timestamp',timestamp:'00:04:00'},request,telemetry()),true);
  assert.equal(r.sourceMatches({...source,quote:'This earlier quote has no local timestamp',timestamp:'00:09:00'},request,telemetry()),false);
});

test('rejected web answer replaced by separate local call, no unverified source leaks', async () => {
  let localCalls = 0;
  const result = await r.resolveResearchAnswer(req,telemetry(),async () => JSON.stringify({
    source:{...source,timestamp:'00:18:00'},answer:'UNVERIFIED_WEB_FACT',localAnswer:'CONTAMINATED'}),
    async (budget,signal) => { localCalls++; assert.ok(budget > 39000 && budget <= 40000); assert.equal(signal.aborted,false); return 'The argument explains the hesitation.'; });
  assert.equal(localCalls,1);
  assert.equal(result.reason,'timestamp_mismatch');
  assert.equal(result.researchStatus,'local_context');
  assert.deepEqual(result.sources,[]);
  assert.match(result.answer,/argument explains/);
  assert.doesNotMatch(result.answer,/UNVERIFIED|CONTAMINATED|Daha geniş/);
});

test('successful research skips local model; research timeout leaves bounded local budget', async () => {
  const matched = await r.resolveResearchAnswer(req,telemetry(),async () => JSON.stringify({source,answer:'Matched'}),
    async () => assert.fail('unnecessary model call'));
  assert.equal(matched.answer,'Matched');
  let clock = 0;
  const fallback = await r.resolveResearchAnswer(req,telemetry(),async (budget) => {
    assert.equal(budget,35000); clock += budget; throw new Error('Codex translation timed out');
  },async (budget) => { assert.equal(budget,15000); return 'Local'; },() => clock);
  assert.equal(fallback.reason,'research_timeout');
  assert.equal(fallback.researchStatus,'local_context');
});

test('malformed research falls back; local failures are not marked successful', async () => {
  await assert.rejects(r.resolveResearchAnswer(req,telemetry(),async () => 'bad JSON',async () => ''),/bos cevap/);
  await assert.rejects(r.resolveResearchAnswer(req,telemetry(),async () => 'null',async () => {throw new Error('local failed');}),/local failed/);
  assert.match(r.localSceneInstructions(),/niyet ve alt metni/);
  assert.match(r.localSceneInstructions(),/Kullanici sorusunda alintiladigi replik/);
});

test('slow research starts isolated answer early and cancels unused child before return', async () => {
  let started = false, cancelled = false;
  const result = await r.resolveResearchAnswer(req,telemetry(),async () => {
    await new Promise((resolve) => setTimeout(resolve,20));
    assert.equal(started,true);
    return JSON.stringify({source,answer:'Source wins'});
  },(budget,signal) => new Promise((resolve,reject) => {
    started = true;
    assert.ok(budget > 39000);
    signal.addEventListener('abort',() => {cancelled=true; reject(new Error('cancelled'));},{once:true});
  }),Date.now,0);
  assert.equal(result.answer,'Source wins');
  assert.equal(cancelled,true);
});

test('source timeout reuses already running local answer instead of another 15s attempt', async () => {
  let calls = 0;
  const result = await r.resolveResearchAnswer(req,telemetry(),async () => {
    await new Promise((resolve) => setTimeout(resolve,20));
    assert.equal(calls,1);
    throw new Error('timed out');
  },async (budget) => {calls++; assert.ok(budget>39000); return 'Local scene answer';},Date.now,0);
  assert.equal(calls,1);
  assert.equal(result.researchStatus,'local_context');
});
