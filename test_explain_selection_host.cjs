'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createExplainHost} = require('./explain-selection-host.cjs');
const valid = { term: 'karaağaç', summary: 'Karaağaç bir ağaç türüdür. Yaprakları belirgin damarlıdır.', visualQuery: 'elm tree leaves', uncertain: false };
const call = (host, selectedText = 'karaağaçları', contextText = '') => host('host_explain_summary', {selectedText, contextText});
const nativeOnlySmartFinder = options=>require('./smart-images-adapter.cjs').createImageFinder({...options,loadProvider:()=>{throw Error('EXTERNAL_PROVIDER_NOT_INSTALLED');}});

// Execute the actual bridge wiring; never load the bridge's server/process startup.
function imageAdapterFixture(fetchCandidates) {
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'bridge-host.cjs'),'utf8');
  const start=source.indexOf('const explainSelectionHost =');
  const end=source.indexOf('let ClassicLevelCtor',start);
  assert.ok(start>=0 && end>start,'Explain wiring must exist');
  const context={
    createSmartImageFinder: nativeOnlySmartFinder,
    require:id=>{assert.equal(id,'./explain-selection-host.cjs');return {createExplainHost:deps=>deps};},
    compactText:(value,limit)=>String(value).trim().slice(0,limit),
    fetchTranslateImageCandidates:fetchCandidates,
  };
  vm.runInNewContext(source.slice(start,end)+';globalThis.adapter=explainSelectionHost;',context);
  return context.adapter;
}
const imageRow={imageUrl:'https://images.example.com/organism.jpg',pageUrl:'https://example.com/organism',thumbUrl:'https://images.example.com/thumb.jpg',title:'Organism'};
const imageAction=(host,extra={})=>host('host_explain_images',{selectedText:'organism',...extra});

test('progressive images preserve validated pending/ranker/preview metadata without leaking worker data',async()=>{
  const host=createExplainHost({findImages:async()=>({candidates:[{...imageRow,sourceUrl:imageRow.pageUrl,previewOnly:true}],rankingPending:true,ranker:'OpenCLIP',warningCode:'CLIP_TIMEOUT',workerPid:123,token:'PRIVATE'})});
  const result=await imageAction(host);
  assert.equal(result.rankingPending,true);
  assert.equal(result.ranker,'OpenCLIP');
  assert.equal(result.warningCode,'CLIP_TIMEOUT');
  assert.equal(result.candidates[0].previewOnly,true);
  assert.equal(result.workerPid,undefined);assert.equal(result.token,undefined);
  const unsafe=createExplainHost({findImages:async()=>({candidates:[],rankingPending:'true',ranker:'<script>',warningCode:'PRIVATE DETAIL'})});
  const clean=await imageAction(unsafe);
  assert.equal(clean.rankingPending,undefined);assert.equal(clean.ranker,undefined);assert.equal(clean.warningCode,undefined);
});

// Real providers, relevance scoring, selection and Explain adapter; only remote
// metadata transport is replaced. Never execute bridge server/process startup.
function nativeImageFixture({commons=[],wikipedia=[],openverse=[],fail=[],commonsByQuery={},articleImages={},smartCandidates}={}) {
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'bridge-host.cjs'),'utf8');
  const span=(start,end)=>{
    const a=source.indexOf(start),b=source.indexOf(end,a);
    assert.ok(a>=0 && b>a,'real image fixture source boundaries must exist');
    return source.slice(a,b);
  };
  const requests=[];
  const context={
    createSmartImageFinder: smartCandidates ? options=>require('./smart-images-adapter.cjs').createImageFinder({...options,loadProvider:()=>({createProvider:({acceptCandidate})=>({findImages:async query=>({candidates:smartCandidates.filter(candidate=>acceptCandidate(candidate,query)),rankingPending:false,ranker:'OpenCLIP'})})})}) : nativeOnlySmartFinder,
    URL,URLSearchParams,AbortController,setTimeout,clearTimeout,process:{env:{}},
    translationFormat:require('./translate-selection-format.cjs'),
    require:id=>{
      assert.equal(id,'./explain-selection-host.cjs');
      return require(id);
    },
    runCodexTranslation:()=>{throw Error('native image requests cannot invoke a model');},
    fetch:async(url,options)=>{
      const parsed=new URL(url); requests.push({url:parsed.href,signal:options?.signal});
      const provider=parsed.hostname==='commons.wikimedia.org'?'commons':parsed.hostname==='en.wikipedia.org'?'wikipedia':parsed.hostname==='api.openverse.engineering'?'openverse':null;
      if (!provider || (provider!=='openverse' && parsed.pathname!=='/w/api.php')) throw Error('unexpected additional image/proxy request');
      if (fail.includes(provider)) throw Error('PRIVATE_NATIVE_PROVIDER_DETAIL');
      if (parsed.searchParams.get('generator')==='images' && fail.includes('article')) throw Error('PRIVATE_ARTICLE_PROVIDER_DETAIL');
      const searchQuery=parsed.searchParams.get('gsrsearch');
      const commonsRows=Object.prototype.hasOwnProperty.call(commonsByQuery,searchQuery)?commonsByQuery[searchQuery]:commons;
      const wikiRows=parsed.searchParams.get('generator')==='images'
        ? (articleImages[parsed.searchParams.get('pageids')] || []) : wikipedia;
      const body=provider==='openverse'?{results:openverse}:{query:{pages:Object.fromEntries((provider==='commons'?commonsRows:wikiRows).map((page,index)=>[String(index+1),page]))}};
      const response={ok:true,status:200,json:async()=>structuredClone(body)};
      return response;
    },
  };
  const constants=['TRANSLATE_IMAGE_CANDIDATE_LIMIT','TRANSLATE_IMAGE_SEARCH_TIMEOUT_MS'].map(name=>{
    const line=source.split(/\r?\n/).find(value=>value.startsWith('const '+name+' ='));
    assert.ok(line,'image constant must come from real bridge source');return line;
  }).join('\n');
  const realFunctions=[
    constants,
    span('function compactText(', 'function normalizeTraceId('),
    span('function translationTargetFromPayload(', 'function parseMnemonicCandidateText('),
    span('function normalizeSearchTerm(', 'function translateImageCandidatesCacheKey('),
    span('const explainSelectionHost =', 'let ClassicLevelCtor'),
    ';globalThis.actualImageHost=explainSelectionHost;globalThis.actualImageFetch=fetchTranslateImageCandidates;',
  ].join('\n');
  vm.runInNewContext(realFunctions,context);
  return {host:context.actualImageHost,requests,
    translate:(payload,options)=>context.actualImageFetch(payload,options),
  };
}
function nativeCommonsRow(term,id,extra={}) {
  return {title:`File:${term} ${id}.jpg`,imageinfo:[{
    url:`https://upload.wikimedia.org/wikipedia/commons/a/ab/Native_${id}.jpg`,
    thumburl:`https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Native_${id}.jpg/520px-Native_${id}.jpg`,
    descriptionurl:`https://commons.wikimedia.org/wiki/File:Native_${id}.jpg`,
    mime:'image/jpeg',width:2400,height:1600,
    extmetadata:{LicenseShortName:{value:'CC BY 4.0'},Artist:{value:'<a>Fixture author</a>'},ImageDescription:{value:`${term} public reference photograph`},Categories:{value:`${term} organisms`}},
    ...extra,
  }]};
}
function nativeWikipediaRow(term,id,extra={}) {
  return {index:1,title:term,pageimage:`${term}_${id}.jpg`,canonicalurl:`https://en.wikipedia.org/wiki/${encodeURIComponent(term)}`,
    thumbnail:{source:`https://thumb.wikimedia.org/wikipedia/commons/a/ab/Lead_${id}.jpg/960px-Lead_${id}.jpg`,width:960,height:640},
    original:{source:`https://upload.wikimedia.org/wikipedia/commons/a/ab/Lead_${id}.jpg`,width:2400,height:1600},...extra};
}
const nativePayload=term=>({selectedText:term,contextText:'',result:{targetText:term},limit:5});
const metadataHosts=fixture=>fixture.requests.map(request=>new URL(request.url).hostname);

test('actual smart wiring retains the native human-thinking meaning guard before returning alternatives',async()=>{
  const candidates=[
    {imageUrl:'https://images.example/land.jpg',sourceUrl:'https://source.example/land',title:'Mull island coastline'},
    {imageUrl:'https://images.example/think.jpg',sourceUrl:'https://source.example/think',title:'Thoughtful person pondering a decision'},
  ];
  const f=nativeImageFixture({smartCandidates:candidates});
  const result=await f.host('host_explain_images',{selectedText:'ponder'});
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].title,'Thoughtful person pondering a decision');
  assert.equal(result.ranker,'OpenCLIP');assert.equal(result.rankingPending,false);
  assert.equal(f.requests.length,0,'provider fixture must not invoke native network metadata');
});

// A sparse depicts index must not hide relevant files embedded in the exact
// selected article. Losing the article metadata branch reproduces one image.
test('native entity article supplies distinct alternatives when depicts is empty',async()=>{
  const lead=nativeWikipediaRow('Sequoia sempervirens',500,{pageid:12345,pageprops:{wikibase_item:'Q150129'}});
  const one=nativeCommonsRow('Sequoia sempervirens whole tree',501);
  const two=nativeCommonsRow('Sequoia sempervirens foliage',502);
  const duplicate=nativeCommonsRow('Sequoia sempervirens duplicate',503,{url:lead.original.source+'?download=1'});
  const noise=nativeCommonsRow('Unrelated motorway logo',504);
  const unsafe=nativeCommonsRow('Sequoia sempervirens unsafe',505,{thumburl:'https://evil.example/x.jpg'});
  const f=nativeImageFixture({wikipedia:[lead],articleImages:{12345:[one,two,duplicate,noise,unsafe]},commonsByQuery:{'haswbstatement:P180=Q150129':[]}});
  const result=await f.host('host_explain_images',{selectedText:'sekoya ağacı',visualQuery:'sequoia tree',limit:5});
  assert.equal(result.candidates.length,3);
  assert.equal(result.candidates[0].imageUrl,lead.original.source);
  assert.deepEqual(new Set(result.candidates.slice(1).map(c=>c.imageUrl)),new Set([one.imageinfo[0].url,two.imageinfo[0].url]));
  assert.deepEqual(entityCommonsQueries(f),['haswbstatement:P180=Q150129']);
  const request=f.requests.map(r=>new URL(r.url)).find(u=>u.searchParams.get('generator')==='images');
  assert.ok(request,'article files must use the metadata generator, never keyword search');
  assert.equal(request.hostname,'en.wikipedia.org');
  assert.equal(request.searchParams.get('pageids'),'12345');
  assert.equal(request.searchParams.get('prop'),'imageinfo');
  assert.ok(Number(request.searchParams.get('gimlimit'))<=24);
  assertPublicEntityImages(result);
});

test('article alternatives belong only to the ranked non-disambiguation entity',async()=>{
  const lead=nativeWikipediaRow('elm tree',510,{index:2,pageid:222,pageprops:{wikibase_item:'Q131113'}});
  const ambiguous=nativeWikipediaRow('elm tree',511,{index:1,pageid:111,pageprops:{wikibase_item:'Q777',disambiguation:''}});
  const chosen=nativeCommonsRow('elm tree leaves',512),wrong=nativeCommonsRow('elm tree pub sign',513);
  const f=nativeImageFixture({wikipedia:[ambiguous,lead],articleImages:{111:[wrong],222:[chosen]},commonsByQuery:{'haswbstatement:P180=Q131113':[]}});
  const result=await f.host('host_explain_images',{selectedText:'elm tree',limit:5});
  assert.equal(result.candidates.length,2);
  assert.ok(result.candidates.some(c=>c.imageUrl===chosen.imageinfo[0].url));
  assert.ok(!result.candidates.some(c=>c.imageUrl===wrong.imageinfo[0].url));
  const galleries=f.requests.map(r=>new URL(r.url)).filter(u=>u.searchParams.get('generator')==='images');
  assert.deepEqual(galleries.map(u=>u.searchParams.get('pageids')),['222']);
});

test('empty or failed article metadata preserves existing lead and depicts without keyword filler',async()=>{
  for(const fail of [[],['article']]) {
    const lead=nativeWikipediaRow('quasar',520,{pageid:333,pageprops:{wikibase_item:'Q83373'}});
    const depicted=nativeCommonsRow('quasar astronomy',521);
    const f=nativeImageFixture({wikipedia:[lead],fail,commonsByQuery:{'haswbstatement:P180=Q83373':[depicted]}});
    const result=await f.host('host_explain_images',{selectedText:'quasar',limit:5});
    assert.equal(result.candidates.length,2);
    assert.deepEqual(entityCommonsQueries(f),['haswbstatement:P180=Q83373']);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_ARTICLE_PROVIDER_DETAIL/);
  }
});

test('article lookup cannot be enabled by invalid provider page IDs or payload hints',async()=>{
  for(const pageid of [0,-1,'123',1.2,Number.MAX_SAFE_INTEGER+1,undefined]) {
    const lead=nativeWikipediaRow('quasar',530,{pageid,pageprops:{wikibase_item:'Q83373'}});
    const f=nativeImageFixture({wikipedia:[lead],commonsByQuery:{'haswbstatement:P180=Q83373':[]}});
    const result=await f.host('host_explain_images',{selectedText:'quasar',pageid:123,articlePageId:123,limit:5});
    assert.equal(result.candidates.length,1);
    assert.equal(f.requests.filter(r=>new URL(r.url).searchParams.get('generator')==='images').length,0);
  }
});

test('article membership does not waive human-thinking sense evidence or logo exclusion',async()=>{
  const lead=nativeWikipediaRow('pondering',540,{pageimage:'Pondering_person.jpg',pageid:444,pageprops:{wikibase_item:'Q123456'}});
  const person=nativeCommonsRow('pondering thoughtful person considering decision',541);
  const landscape=nativeCommonsRow('pondering Scotland landscape',542);
  const logo=nativeCommonsRow('pondering thoughtful person logo',543);
  const f=nativeImageFixture({wikipedia:[lead],articleImages:{444:[person,landscape,logo]},commonsByQuery:{'haswbstatement:P180=Q123456':[]}});
  const result=await f.host('host_explain_images',{selectedText:'pondering',limit:5});
  assert.equal(result.candidates.length,2);
  assert.ok(result.candidates.some(c=>c.imageUrl===person.imageinfo[0].url));
  assert.ok(result.candidates.every(c=>![landscape.imageinfo[0].url,logo.imageinfo[0].url].includes(c.imageUrl)));
});

// Replacing rather than extending the target with a disambiguated article
// title drops legitimate original-term diagrams (reviewer reproduction).
test('entity title extends matching without replacing original diagram concept',async()=>{
  for(const [term,title,qid] of [['cell','Cell (biology)','Q7868'],['fault','Fault (geology)','Q12032']]) {
    const lead=nativeWikipediaRow(term,550,{title,pageprops:{wikibase_item:qid}});
    const diagram=nativeCommonsRow(`${term} structure diagram`,551);
    const f=nativeImageFixture({wikipedia:[lead],commonsByQuery:{[`haswbstatement:P180=${qid}`]:[diagram]}});
    const result=await f.host('host_explain_images',{selectedText:term,limit:5});
    assert.equal(result.candidates.length,2,term+' lost a valid original-term diagram');
    assert.equal(result.candidates[0].imageUrl,lead.original.source);
    assert.ok(result.candidates.some(c=>c.imageUrl===diagram.imageinfo[0].url));
  }
});

// Break caught: real Explain wiring omits its internal opt-in and five broken
// Openverse previews suppress directly supplied native Commons previews.
test('native Explain wiring selects five supplied Commons previews without Openverse or image probing',async()=>{
  const term='bdelloid';
  const commons=Array.from({length:5},(_,i)=>nativeCommonsRow(term,i));
  const openverse=commons.map((page,i)=>({title:page.title.replace(/^File:/,''),url:page.imageinfo[0].url,thumbnail:`https://api.openverse.org/v1/images/native-${i}/thumb/`,foreign_landing_url:page.imageinfo[0].descriptionurl,license:'CC BY 4.0',creator:'Fixture author',width:2400,height:1600,filetype:'jpeg',description:`${term} public reference photograph`,tags:[{name:`${term} organisms`}]}));
  const f=nativeImageFixture({commons,openverse});
  const result=await f.host('host_explain_images',{selectedText:term,limit:99});
  assert.equal(result.readOnly,true);assert.equal(result.mutationApplied,false);
  assert.equal(result.candidates.length,5);
  assert.ok(result.candidates.every(candidate=>new URL(candidate.thumbnailUrl).hostname==='upload.wikimedia.org'));
  assert.ok(result.candidates.every(candidate=>candidate.license==='CC BY 4.0'&&candidate.creator==='Fixture author'));
  assert.equal(metadataHosts(f).includes('api.openverse.engineering'),false,'internal Explain path must not call Openverse');
  assert.ok(metadataHosts(f).includes('commons.wikimedia.org'));
  assert.ok(metadataHosts(f).includes('en.wikipedia.org'),'native entity-lead provider must be available for ordinary concepts');
  assert.ok(f.requests.length<=4,'three bounded Commons queries plus one entity-lead query; no image/proxy/liveness requests');
});

// Break caught: deduplication by title lets one original image with different
// titles/query fragments occupy several slots and drops distinct native images.
test('native image identity strips original query/hash while preserving distinct previews and rich metadata',async()=>{
  const first=nativeCommonsRow('bdelloid',1,{extmetadata:{ImageDescription:{value:'bdelloid photograph'}}});
  const richer=nativeCommonsRow('bdelloid',1,{url:first.imageinfo[0].url+'?download=1#fragment',thumburl:'https://thumb.wikimedia.org/wikipedia/commons/a/ab/Native_1.jpg/640px-Native_1.jpg'});
  richer.title='File:bdelloid second public title.jpg';
  const distinct=nativeCommonsRow('bdelloid',2);
  const f=nativeImageFixture({commons:[first,richer,distinct]});
  const result=await f.translate(nativePayload('bdelloid'),{nativePreviewsOnly:true});
  assert.equal(result.candidates.length,2);
  assert.equal(new Set(Array.from(result.candidates,candidate=>candidate.imageUrl.replace(/[?#].*$/,''))).size,2);
  const kept=Array.from(result.candidates).find(candidate=>candidate.imageUrl.includes('Native_1.jpg'));
  assert.equal(kept.thumbUrl,'https://thumb.wikimedia.org/wikipedia/commons/a/ab/Native_1.jpg/640px-Native_1.jpg');
  assert.equal(kept.license,'CC BY 4.0');assert.equal(kept.creator,'Fixture author');
  assert.equal(kept.width,2400);assert.equal(kept.height,1600);
  assert.match(kept.description,/bdelloid/);assert.match(kept.categories,/bdelloid/);
  assert.equal(metadataHosts(f).includes('api.openverse.engineering'),false);
});

for(const term of ['elm tree','quasar']) {
  // Break caught: native-only filtering accidentally removes Wikipedia lead
  // images or only enables the lead provider for the old diagram target list.
  test(`native Explain uses supplied Wikipedia lead and Commons previews for ${term}`,async()=>{
    const commons=nativeCommonsRow(term,20),lead=nativeWikipediaRow(term,21);
    const f=nativeImageFixture({commons:[commons],wikipedia:[lead]});
    const result=await f.host('host_explain_images',{selectedText:term,limit:5});
    assert.equal(result.candidates.length,2);
    assert.ok(result.candidates.some(candidate=>candidate.thumbnailUrl===commons.imageinfo[0].thumburl));
    assert.ok(result.candidates.some(candidate=>candidate.thumbnailUrl===lead.thumbnail.source&&candidate.sourceUrl===lead.canonicalurl));
    assert.equal(metadataHosts(f).includes('api.openverse.engineering'),false);
  });
}

// Break caught: missing native thumbnails get silently replaced with originals,
// and suffix/userinfo/redirect hosts are accepted as if they were Wikimedia.
test('native candidates reject original-only malformed private and deceptive preview URLs without additional fetches',async()=>{
  const previews=[undefined,'not a url','http://upload.wikimedia.org/native.jpg','https://upload.wikimedia.org.evil.example/native.jpg','https://upload.wikimedia.org@evil.example/native.jpg','https://127.0.0.1/native.jpg','https://10.0.0.1/native.jpg','https://thumb.wikimedia.org:8443/native.jpg','https://commons.wikimedia.org/wiki/Special:Redirect/file/native.jpg','https://evil.example/redirect?url=https://upload.wikimedia.org/native.jpg'];
  const commons=previews.map((thumburl,i)=>nativeCommonsRow('bdelloid',30+i,{thumburl}));
  commons.push(nativeCommonsRow('bdelloid',49,{url:'https://192.168.0.1/private.jpg'}));
  commons.push(nativeCommonsRow('bdelloid',51,{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Bdelloid.ogg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Bdelloid.ogg/520px-Bdelloid.ogg',mime:'audio/ogg'}));
  const lead=nativeWikipediaRow('bdelloid',50,{thumbnail:undefined});
  const f=nativeImageFixture({commons,wikipedia:[lead]});
  const result=await f.host('host_explain_images',{selectedText:'bdelloid',limit:5});
  assert.equal(result.candidates.length,0,'unsafe/missing native previews are clean exclusions, never original fallbacks');
  assert.equal(result.readOnly,true);assert.equal(result.mutationApplied,false);
  assert.ok(metadataHosts(f).every(host=>['commons.wikimedia.org','en.wikipedia.org'].includes(host)));
});

// Break caught: one native provider error suppresses the other provider's valid
// result, or a clean empty response is converted into a provider exception.
test('native adapter keeps Wikipedia partial success and distinguishes clean empty from all-provider errors',async()=>{
  const lead=nativeWikipediaRow('quasar',70);
  const partial=nativeImageFixture({wikipedia:[lead],fail:['commons']});
  const result=await partial.host('host_explain_images',{selectedText:'quasar'});
  assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].thumbnailUrl,lead.thumbnail.source);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NATIVE_PROVIDER_DETAIL/);
  const empty=nativeImageFixture();
  assert.equal((await empty.host('host_explain_images',{selectedText:'quasar'})).candidates.length,0);
  const failed=nativeImageFixture({fail:['commons','wikipedia']});
  await assert.rejects(failed.host('host_explain_images',{selectedText:'quasar'}),error=>error.code==='EXPLAIN_IMAGE_PROVIDER_ERROR'&&error.message==='EXPLAIN_IMAGE_PROVIDER_ERROR');
  assert.doesNotMatch(JSON.stringify(failed.host.diagnostics()),/PRIVATE_NATIVE_PROVIDER_DETAIL|quasar/);
});

// Break caught: a user payload toggles the internal option, or implementing
// Explain's new path changes normal translation provider ordering/selection.
test('normal translation ignores payload native flag and retains Openverse-first behavior',async()=>{
  const commons=nativeCommonsRow('bdelloid',80);
  const item={title:'bdelloid photograph',url:'https://images.example.com/bdelloid.jpg',thumbnail:'https://api.openverse.org/v1/images/default/thumb/',foreign_landing_url:'https://source.example.com/bdelloid',license:'CC BY 4.0',creator:'Fixture author',width:2400,height:1600,filetype:'jpeg',description:'bdelloid organism photograph'};
  const plain=nativeImageFixture({commons:[commons],openverse:[item]});
  const spoof=nativeImageFixture({commons:[commons],openverse:[item]});
  const baseline=await plain.translate(nativePayload('bdelloid'));
  const injected=await spoof.translate({...nativePayload('bdelloid'),nativePreviewsOnly:true});
  assert.deepEqual(Array.from(injected.candidates,candidate=>[candidate.imageUrl,candidate.thumbUrl,candidate.source]),Array.from(baseline.candidates,candidate=>[candidate.imageUrl,candidate.thumbUrl,candidate.source]));
  assert.ok(Array.from(baseline.candidates).some(candidate=>candidate.source==='Openverse'&&candidate.thumbUrl===item.thumbnail));
  assert.deepEqual(metadataHosts(plain),['api.openverse.engineering','commons.wikimedia.org','api.openverse.engineering','commons.wikimedia.org','api.openverse.engineering','commons.wikimedia.org']);
  assert.deepEqual(metadataHosts(spoof),metadataHosts(plain));
});

// Entity tests keep the real dispatch/normalization/scoring stack. Only the
// existing metadata transport fixture distinguishes depicts queries from words.
const entityCommonsQueries=fixture=>fixture.requests.filter(request=>new URL(request.url).hostname==='commons.wikimedia.org').map(request=>new URL(request.url).searchParams.get('gsrsearch'));
const assertPublicEntityImages=result=>{
  assert.equal(result.readOnly,true);assert.equal(result.mutationApplied,false);
  for(const candidate of result.candidates) for(const key of Object.keys(candidate)) assert.ok(['imageUrl','sourceUrl','title','thumbnailUrl','license','creator'].includes(key),'private entity/identity metadata leaked: '+key);
};
for(const fixtureCase of [
  {term:'quasar',qid:'Q83373',noise:'Quasar motorcycle showroom',entityTitle:'Quasar astronomy'},
  {term:'elm tree',qid:'Q131113',noise:'Elm tree pub sign',entityTitle:'Elm tree herbarium'},
  {term:'Quasar motorcycle',qid:'Q999999',noise:'Quasar motorcycle unrelated astronomy',entityTitle:'Quasar motorcycle vehicle'},
]) {
  // Break caught: keyword matches mix another entity's motorcycle/pub into a
  // resolved concept, or hardcoded science logic overrides an explicit vehicle.
  test(`native entity anchor uses actual depicts dispatch and lead first for ${fixtureCase.term}`,async()=>{
    const {term,qid,noise,entityTitle}=fixtureCase;
    const lead=nativeWikipediaRow(term,200,{pageprops:{wikibase_item:qid}});
    const wrong=nativeCommonsRow(noise,201);
    const depicted=nativeCommonsRow(term,202);depicted.title=`File:${entityTitle}.jpg`;
    const mistagged=nativeCommonsRow('Daloa travel photograph',203);
    const query=`haswbstatement:P180=${qid}`;
    const f=nativeImageFixture({commons:[wrong],wikipedia:[lead],commonsByQuery:{[query]:[depicted,mistagged]}});
    const result=await f.host('host_explain_images',{selectedText:term,limit:5});
    assert.equal(result.candidates.length,2);
    assert.equal(result.candidates[0].thumbnailUrl,lead.thumbnail.source,'only the selected entity lead is placed first');
    assert.ok(result.candidates.some(candidate=>candidate.thumbnailUrl===depicted.imageinfo[0].thumburl));
    assert.ok(result.candidates.every(candidate=>candidate.thumbnailUrl!==wrong.imageinfo[0].thumburl),'resolved entity cannot be padded with keyword matches');
    assert.ok(result.candidates.every(candidate=>candidate.thumbnailUrl!==mistagged.imageinfo[0].thumburl),'structured depicts still passes the existing relevance scorer; entity tags are not absolute visual proof');
    assert.deepEqual(entityCommonsQueries(f),[query]);
    assert.deepEqual(metadataHosts(f),['en.wikipedia.org','commons.wikimedia.org'],'one anchor lookup then one fixed Commons search; no image/Wikidata/proxy/model requests');
    const wikipediaRequest=new URL(f.requests[0].url);
    assert.ok((wikipediaRequest.searchParams.get('prop')||'').split('|').includes('pageprops'));
    const requestedProps=wikipediaRequest.searchParams.get('ppprop');
    if(requestedProps) for(const property of ['wikibase_item','disambiguation']) assert.ok(requestedProps.split('|').includes(property));
    assertPublicEntityImages(result);
  });
}

// Break caught: truth-testing an empty disambiguation property accepts the
// wrong top page, or array insertion order wins over Wikipedia search rank.
test('native entity selection skips disambiguation and keeps only the first ranked valid entity lead',async()=>{
  const ambiguous=nativeWikipediaRow('Quasar ambiguous',210,{index:1,pageprops:{wikibase_item:'Q111111',disambiguation:''}});
  const chosen=nativeWikipediaRow('quasar',211,{index:2,pageprops:{wikibase_item:'Q83373'}});
  const later=nativeWikipediaRow('Quasar motorcycle',212,{index:3,pageprops:{wikibase_item:'Q999999'}});
  const depicted=nativeCommonsRow('quasar',213),wrong=nativeCommonsRow('Quasar motorcycle',214);
  const f=nativeImageFixture({wikipedia:[later,ambiguous,chosen],commons:[wrong],commonsByQuery:{'haswbstatement:P180=Q83373':[depicted]}});
  const result=await f.host('host_explain_images',{selectedText:'quasar',limit:5});
  assert.equal(result.candidates.length,2);assert.equal(result.candidates[0].thumbnailUrl,chosen.thumbnail.source);
  assert.ok(result.candidates.every(candidate=>![ambiguous.thumbnail.source,later.thumbnail.source,wrong.imageinfo[0].thumburl].includes(candidate.thumbnailUrl)));
  assert.deepEqual(entityCommonsQueries(f),['haswbstatement:P180=Q83373']);assertPublicEntityImages(result);
});

// Break caught: malformed QIDs are interpolated into Commons search, or a
// payload-supplied identity bypasses the internal Wikipedia-only anchor choice.
test('native entity fallback requires strict non-disambiguation QID and ignores payload identity hints',async()=>{
  const cases=[undefined,{}, {wikibase_item:'Q0'}, {wikibase_item:'q83373'}, {wikibase_item:'Q083373'}, {wikibase_item:'Q83373 OR quasar'}, {wikibase_item:'Q83373/redirect'}, {wikibase_item:'Q83373',disambiguation:''}];
  for(const pageprops of cases) {
    const lead=nativeWikipediaRow('quasar',220,{pageprops});
    const keyword=nativeCommonsRow('quasar',221);
    const f=nativeImageFixture({wikipedia:[lead],commons:[keyword]});
    const result=await f.host('host_explain_images',{selectedText:'quasar',entityQid:'Q83373',wikibase_item:'Q83373',nativePreviewsOnly:true,limit:5});
    assert.ok(result.candidates.some(candidate=>candidate.thumbnailUrl===keyword.imageinfo[0].thumburl),'unresolved identity retains the existing native keyword fallback');
    assert.deepEqual(entityCommonsQueries(f),['quasar','quasar object','quasar scene']);
    assertPublicEntityImages(result);
  }
});

for(const empty of [false,true]) {
  // Break caught: a resolved page without a usable lead is treated as no
  // entity and gets unrelated keyword filler, instead of accepting 0..5 depicts.
  test(`native entity with no lead keeps depicts-only ${empty?'clean empty':'nonempty'} result`,async()=>{
    const page=nativeWikipediaRow('quasar',230,{pageprops:{wikibase_item:'Q83373'},thumbnail:undefined});
    const wrong=nativeCommonsRow('Quasar motorcycle',231),depicted=nativeCommonsRow('quasar',232);
    const f=nativeImageFixture({wikipedia:[page],commons:[wrong],commonsByQuery:{'haswbstatement:P180=Q83373':empty?[]:[depicted]}});
    const result=await f.host('host_explain_images',{selectedText:'quasar',limit:5});
    assert.equal(result.candidates.length,empty?0:1);
    if(!empty) assert.equal(result.candidates[0].thumbnailUrl,depicted.imageinfo[0].thumburl);
    assert.deepEqual(entityCommonsQueries(f),['haswbstatement:P180=Q83373']);assertPublicEntityImages(result);
  });
}

// Break caught: a failed depicts query discards a valid entity lead or retries
// through semantically unrelated keyword providers and leaks provider details.
test('native entity partial Commons failure preserves selected lead without keyword recovery',async()=>{
  const lead=nativeWikipediaRow('elm tree',240,{pageprops:{wikibase_item:'Q131113'}});
  const f=nativeImageFixture({wikipedia:[lead],fail:['commons']});
  const result=await f.host('host_explain_images',{selectedText:'elm tree',limit:5});
  assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].thumbnailUrl,lead.thumbnail.source);
  assert.deepEqual(entityCommonsQueries(f),['haswbstatement:P180=Q131113']);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NATIVE_PROVIDER_DETAIL/);
  assertPublicEntityImages(result);
});

// Break caught: entity lead reinsertion bypasses the existing thinking/human
// relevance gate, making the identical landscape acceptable only with a QID.
for(const resolved of [false,true]) {
  test(`native entity sense gate rejects the same pondering landscape ${resolved?'with':'without'} QID`,async()=>{
    const lead=nativeWikipediaRow('pondering',300,{pageimage:'Pondering_landscape.jpg',canonicalurl:'https://en.wikipedia.org/wiki/Pondering_landscape',...(resolved?{pageprops:{wikibase_item:'Q123456'}}:{})});
    const f=nativeImageFixture({wikipedia:[lead],commonsByQuery:{'haswbstatement:P180=Q123456':[]}});
    const result=await f.host('host_explain_images',{selectedText:'pondering',limit:5});
    assert.equal(result.candidates.length,0,'entity metadata must not waive the existing positive human-thinking evidence requirement');
    if(resolved) assert.deepEqual(entityCommonsQueries(f),['haswbstatement:P180=Q123456']);
    assertPublicEntityImages(result);
  });
}

// Break caught: fixing reinsertion by dropping all entity leads also removes
// a valid person-thinking lead or loses its first-place priority to richer extras.
test('native entity sense gate retains a relevant human thinking lead first',async()=>{
  const lead=nativeWikipediaRow('pondering',301,{pageimage:'Pondering_person.jpg',canonicalurl:'https://en.wikipedia.org/wiki/Pondering_person',pageprops:{wikibase_item:'Q123456'}});
  const depicted=nativeCommonsRow('pondering thoughtful person considering decision',302);
  const f=nativeImageFixture({wikipedia:[lead],commonsByQuery:{'haswbstatement:P180=Q123456':[depicted]}});
  const result=await f.host('host_explain_images',{selectedText:'pondering',limit:5});
  assert.equal(result.candidates.length,2);
  assert.equal(result.candidates[0].thumbnailUrl,lead.thumbnail.source);
  assert.ok(result.candidates.some(candidate=>candidate.thumbnailUrl===depicted.imageinfo[0].thumburl));
  assert.deepEqual(entityCommonsQueries(f),['haswbstatement:P180=Q123456']);
  assertPublicEntityImages(result);
});

// Break caught: native original identity is used as the display image URL, so
// the existing SVG rejection discards a valid provider-supplied raster preview.
test('native Commons and Wikipedia SVG originals retain supplied PNG previews without exposing private identity',async()=>{
  const commons=nativeCommonsRow('quasar',100,{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar_map.svg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Quasar_map.svg/520px-Quasar_map.svg.png',mime:'image/svg+xml'});
  commons.title='File:Quasar map.svg';
  const wiki=nativeWikipediaRow('quasar',101,{pageimage:'Quasar_lead.svg',original:{source:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar_lead.svg'},thumbnail:{source:'https://thumb.wikimedia.org/wikipedia/commons/a/ab/Quasar_lead.svg/960px-Quasar_lead.svg.png',width:960,height:640}});
  const f=nativeImageFixture({commons:[commons],wikipedia:[wiki]});
  const result=await f.host('host_explain_images',{selectedText:'quasar',limit:5});
  assert.equal(result.candidates.length,2);
  const supplied=[commons.imageinfo[0].thumburl,wiki.thumbnail.source];
  assert.deepEqual(result.candidates.map(candidate=>candidate.imageUrl).sort(),supplied.slice().sort());
  for(const candidate of result.candidates) {
    assert.equal(candidate.thumbnailUrl,candidate.imageUrl,'SVG display must remain the actual supplied raster preview');
    for(const key of Object.keys(candidate)) assert.ok(['imageUrl','sourceUrl','title','thumbnailUrl','license','creator'].includes(key),'private native identity leaked: '+key);
  }
  assert.equal(result.readOnly,true);assert.equal(result.mutationApplied,false);
  assert.ok(metadataHosts(f).every(host=>['commons.wikimedia.org','en.wikipedia.org'].includes(host)),'no SVG/original/proxy/thumbnail probe requests');
});

// Break caught: raster-display URLs deduplicate instead of the original SVG,
// or lowercasing the canonical identity collapses different case-sensitive files.
test('native SVG dedup uses original identity across query hash title and preview differences',async()=>{
  const original='https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar_chart.svg';
  const first=nativeCommonsRow('quasar',110,{url:original+'?download=1#first',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Quasar_chart.svg/520px-Quasar_chart.svg.png',mime:'image/svg+xml'});
  first.title='File:Quasar chart.svg';
  const second=nativeCommonsRow('quasar',111,{url:original+'?other=2#second',thumburl:'https://thumb.wikimedia.org/wikipedia/commons/a/ab/Quasar_chart.svg/640px-Quasar_chart.svg.png',mime:'image/svg+xml'});
  second.title='File:Quasar same chart another public title.svg';
  const wiki=nativeWikipediaRow('quasar',112,{pageimage:'Quasar_chart.svg',original:{source:original},thumbnail:{source:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Quasar_chart.svg/960px-Quasar_chart.svg.png',width:960,height:640}});
  const distinct=nativeCommonsRow('quasar',113,{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/quasar_chart.svg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/quasar_chart.svg/520px-quasar_chart.svg.png',mime:'image/svg+xml'});
  distinct.title='File:Quasar distinct case sensitive source.svg';
  const f=nativeImageFixture({commons:[first,second,distinct],wikipedia:[wiki]});
  const result=await f.host('host_explain_images',{selectedText:'quasar',limit:5});
  assert.equal(result.candidates.length,2,'three variants of the same original count once; different path case remains distinct');
  const sameOriginalPreviews=[first.imageinfo[0].thumburl,second.imageinfo[0].thumburl,wiki.thumbnail.source];
  assert.equal(result.candidates.filter(candidate=>sameOriginalPreviews.includes(candidate.imageUrl)).length,1);
  assert.ok(result.candidates.some(candidate=>candidate.imageUrl===distinct.imageinfo[0].thumburl));
  const shared=result.candidates.find(candidate=>sameOriginalPreviews.includes(candidate.imageUrl));
  assert.equal(shared.license,'CC BY 4.0');assert.equal(shared.creator,'Fixture author');
  for(const candidate of result.candidates) for(const key of Object.keys(candidate)) assert.ok(['imageUrl','sourceUrl','title','thumbnailUrl','license','creator'].includes(key));
  assert.ok(metadataHosts(f).every(host=>['commons.wikimedia.org','en.wikipedia.org'].includes(host)));
});

// Break caught: restoring SVG compatibility accidentally admits originals with
// no raster thumbnail, relaxes the existing GIF gate, or accepts HTML/non-images.
test('native SVG compatibility still excludes missing thumbnails SVG-only previews GIF and non-image originals',async()=>{
  const invalidCommons=[
    nativeCommonsRow('quasar',120,{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar.svg',thumburl:undefined,mime:'image/svg+xml'}),
    nativeCommonsRow('quasar',121,{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar.svg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar.svg',mime:'image/svg+xml'}),
    nativeCommonsRow('quasar',122,{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar.gif',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Quasar.gif/520px-Quasar.gif.png',mime:'image/gif'}),
    nativeCommonsRow('quasar',123,{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar.html',thumburl:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar.png',mime:'text/html'}),
  ];
  const invalidLeads=[
    nativeWikipediaRow('quasar',124,{original:{source:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar.svg'},thumbnail:undefined}),
    nativeWikipediaRow('quasar',125,{original:{source:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Quasar.gif'},thumbnail:{source:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Quasar.gif/960px-Quasar.gif.png',width:960,height:640}}),
  ];
  const f=nativeImageFixture({commons:invalidCommons,wikipedia:invalidLeads});
  const result=await f.host('host_explain_images',{selectedText:'quasar',limit:5});
  assert.equal(result.candidates.length,0,'never fabricate a raster URL or fall back to an original');
  assert.ok(metadataHosts(f).every(host=>['commons.wikimedia.org','en.wikipedia.org'].includes(host)));
});


test('actual image adapter rejects all-provider failure with a sanitized public code', async () => {
  const adapter=imageAdapterFixture(async()=>({candidates:[],errors:['PRIVATE_PROVIDER_DETAIL PRIVATE_URL PRIVATE_SELECTION']}));
  await assert.rejects(adapter.findImages('organism'),error=>{
    assert.equal(error.code,'EXPLAIN_IMAGE_PROVIDER_ERROR');
    assert.equal(error.message,'EXPLAIN_IMAGE_PROVIDER_ERROR');
    assert.doesNotMatch(JSON.stringify(error),/PRIVATE_/);
    return true;
  });
});

test('actual image adapter preserves clean empty results and bounds provider input', async () => {
  let input;
  const adapter=imageAdapterFixture(async payload=>{input=payload;return {candidates:[],errors:[]};});
  const candidates=await adapter.findImages('organism',{limit:99});
  assert.equal(candidates.length,0);
  assert.equal(input.selectedText,'organism');
  assert.equal(input.contextText,'');
  assert.equal(input.result.targetText,'organism');
  assert.equal(input.limit,5);
});

test('actual image adapter retains valid partial results despite another provider failure', async () => {
  const adapter=imageAdapterFixture(async()=>({candidates:[imageRow],errors:['PRIVATE_PROVIDER_DETAIL']}));
  const host=createExplainHost({findImages:adapter.findImages});
  const result=await imageAction(host);
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].sourceUrl,'https://example.com/organism');
  assert.equal(result.candidates[0].thumbnailUrl,'https://images.example.com/thumb.jpg');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
});

test('forceRefresh bypasses completed empty image cache and replaces it with fresh candidates', async () => {
  let starts=0;
  const host=createExplainHost({findImages:async()=>++starts===1?[]:[{...imageRow,sourceUrl:imageRow.pageUrl}]});
  assert.equal((await imageAction(host)).cached,false);
  assert.equal((await imageAction(host)).cached,true);
  const fresh=await imageAction(host,{forceRefresh:true});
  assert.equal(fresh.cached,false);
  assert.equal(fresh.candidates.length,1);
  assert.equal(starts,2);
  const cached=await imageAction(host);
  assert.equal(cached.cached,true);
  assert.equal(cached.candidates.length,1);
  assert.equal(starts,2);
});

test('only boolean true refreshes image cache and summary cache is unaffected', async () => {
  let images=0,models=0;
  const host=createExplainHost({findImages:async()=>{images++;return [];},runModel:async()=>{models++;return valid;}});
  await imageAction(host);
  for(const forceRefresh of [false,undefined,1,'true',{}]) {
    assert.equal((await imageAction(host,{forceRefresh})).cached,true);
  }
  assert.equal(images,1);
  await call(host);
  const summary=await host('host_explain_summary',{selectedText:'karaağaçları',forceRefresh:true});
  assert.equal(summary.cached,true);
  assert.equal(models,1);
});

test('forced image retry coalesces with in-flight ownership instead of starting duplicate work', async () => {
  let starts=0,resolve;
  const host=createExplainHost({findImages:()=>{starts++;return new Promise(done=>{resolve=done;});}});
  const first=imageAction(host);
  await Promise.resolve();
  const retry=imageAction(host,{forceRefresh:true});
  await Promise.resolve();
  assert.equal(starts,1);
  resolve([]);
  const [initial,coalesced]=await Promise.all([first,retry]);
  assert.equal(initial.cached,false);
  assert.equal(coalesced.cached,true);
  assert.equal(starts,1);
});

test('forced image requests preserve fifty-slot admission and can still join an owned key', async () => {
  let starts=0;
  const resolvers=[];
  const host=createExplainHost({findImages:()=>{starts++;return new Promise(resolve=>resolvers.push(resolve));}});
  const jobs=Array.from({length:50},(_,i)=>imageAction(host,{selectedText:String(i),forceRefresh:true}));
  await Promise.resolve();
  try {
    await assert.rejects(imageAction(host,{selectedText:'extra',forceRefresh:true}),/EXPLAIN_CAPACITY/);
    const duplicate=imageAction(host,{selectedText:'0',forceRefresh:true});
    await Promise.resolve();
    assert.equal(starts,50);
    resolvers.forEach(resolve=>resolve([]));
    await Promise.all([...jobs,duplicate]);
    assert.equal(starts,50);
  } finally {
    resolvers.forEach(resolve=>resolve([]));
    await Promise.allSettled(jobs);
  }
});

test('forced retry cannot displace timed-out image work before actual provider settlement', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let starts=0,resolve;
  const host=createExplainHost({findImages:()=>{starts++;return new Promise(done=>{resolve=done;});}});
  const rejected=assert.rejects(imageAction(host),/EXPLAIN_TIMEOUT/);
  await Promise.resolve();
  t.mock.timers.tick(25000);
  await rejected;
  try {
    await assert.rejects(imageAction(host,{forceRefresh:true}),/EXPLAIN_TIMEOUT/);
    assert.equal(starts,1);
  } finally {
    resolve([]);
    for(let i=0;i<8;i++)await Promise.resolve();
  }
});

test('unavailable actual image adapter retries the real provider after settlement without poisoning success cache', async () => {
  let starts=0;
  const adapter=imageAdapterFixture(async()=>++starts===1
    ?{candidates:[],errors:['PRIVATE_PROVIDER_DETAIL']}
    :{candidates:[imageRow],errors:[]});
  const host=createExplainHost({findImages:adapter.findImages,runModel:async()=>valid});
  await assert.rejects(imageAction(host),error=>error.code==='EXPLAIN_IMAGE_PROVIDER_ERROR');
  assert.equal((await call(host)).term,'karaağaç');
  const recovered=await imageAction(host,{forceRefresh:true});
  assert.equal(recovered.cached,false);
  assert.equal(recovered.candidates.length,1);
  assert.equal(starts,2);
  assert.equal((await imageAction(host)).cached,true);
  assert.equal(starts,2);
  assert.doesNotMatch(JSON.stringify(host.diagnostics()),/PRIVATE_|organism/);
});

test('Explain forwards one monotonic deadline and ignores wall-clock jumps', async () => {
  let clock=1000, options;
  const original=Date.now;
  const host=createExplainHost({now:()=>clock,runModel:async(_p,o)=>{
    options=o; clock+=7; Date.now=()=>1; return valid;
  }});
  try {
    const result=await call(host);
    assert.equal(options.deadlineMonotonicMs,26000);
    assert.equal(typeof options.onProgress,'function');
    assert.equal(result.durationMs,7);
  } finally {Date.now=original;}
});

test('expired operation microtask never starts the provider', async () => {
  let clock=0, starts=0;
  const host=createExplainHost({now:()=>clock,runModel:async()=>{starts++;return valid;}});
  const pending=call(host);
  clock=25000;
  await assert.rejects(pending,/EXPLAIN_TIMEOUT/);
  assert.equal(starts,0);
});

test('late provider result cannot enter success cache when timer delivery is delayed', async () => {
  let clock=0, starts=0, signal;
  const host=createExplainHost({now:()=>clock,runModel:async(_p,o)=>{
    starts++;signal=o.signal;
    if(starts===1) clock=25001;
    return valid;
  }});
  await assert.rejects(call(host),/EXPLAIN_TIMEOUT/);
  assert.equal(signal.aborted,true);
  assert.equal((await call(host)).cached,false);
  assert.equal(starts,2);
});

test('Explain telemetry is bounded, coalesced, cloned and content-free', async () => {
  let clock=0, finish, starts=0;
  const host=createExplainHost({now:()=>clock,onTelemetry:event=>{event.phase='observer mutation';throw Error('ignored');},
    runModel:async(_p,o)=>{
      starts++;
      for(let i=0;i<150;i++) {
        clock++;
        o.onProgress({phase:'spawned',stdoutBytes:i,stderrBytes:3,outputBytes:0,
          prompt:'PRIVATE_PROMPT',stdout:'PRIVATE_STDOUT',stderr:'PRIVATE_STDERR',
          path:'C:/PRIVATE_PATH',exitCode:null});
      }
      o.onProgress({phase:'PRIVATE_PHASE',stdoutBytes:1});
      return new Promise(resolve=>{finish=resolve;});
    }});
  const first=call(host,'PRIVATE_SELECTION','PRIVATE_CONTEXT');
  const second=call(host,'PRIVATE_SELECTION','PRIVATE_CONTEXT');
  await Promise.resolve();
  finish(valid);await Promise.all([first,second]);
  assert.equal(starts,1);
  const events=host.diagnostics();
  assert.equal(events.length,128);
  assert.equal(new Set(events.map(event=>event.requestId)).size,1);
  assert.equal(events[0].model,'gpt-6.1-sol');
  assert.equal(events[0].reasoningEffort,'medium');
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_|observer mutation|karaağaç/);
  for(const event of events) {
    assert.deepEqual(Object.keys(event).sort(),[
      'deadlineMs','elapsedMs','exitCode','model','outputBytes','phase',
      'reasoningEffort','remainingMs','requestId','stderrBytes','stdoutBytes',
    ]);
  }
  events[0].phase='external mutation';
  assert.notEqual(host.diagnostics()[0].phase,'external mutation');
});

function deadlineRunnerFixture({resolveCost=0,spawnCost=0,abortDuringResolve=false}={}) {
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const {EventEmitter}=require('node:events');
  const source=fs.readFileSync(path.join(__dirname,'bridge-host.cjs'),'utf8');
  const runner=source.slice(source.indexOf('function runCodexTranslation('),
    source.indexOf('function shouldRetryCodexTranslation('));
  const controller=new AbortController(),child=new EventEmitter();
  child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  let clock=0,spawns=0,kills=0,removals=0,writes=0,timer,settled=false;
  child.kill=()=>{kills++;};
  child.stdin={write(){writes++;},end(){}};
  const context={
    require:id=>{assert.equal(id,'node:perf_hooks');return {performance:{now:()=>clock}};},
    Buffer,process:{env:{}},path,os:{tmpdir:()=> 'PRIVATE_PATH'},randomUUID:()=> 'private-id',
    TRANSLATE_SELECTION_TIMEOUT_MS:25000,TRANSLATE_SELECTION_MODEL:'wrong-default',
    CODEX_DISABLED_FEATURES:[],compactText:(s,n)=>String(s).slice(0,n),
    startTranslateStage:()=>({}),finishTranslateStage(){},getTraceTextMeta:()=>({}),
    classifyTranslateError:()=>({errorClass:'ERROR'}),
    resolveCodexExecutable(){clock+=resolveCost;if(abortDuringResolve)controller.abort();return 'PRIVATE_EXE';},
    spawn(){clock+=spawnCost;spawns++;return child;},
    setTimeout(callback,ms){timer={callback,ms};return 1;},clearTimeout(){},
    fs:{existsSync:()=>true,readFileSync:()=> 'safe result',rmSync(){removals++;}},
  };
  context.modelRoute={run:(primary)=>primary()};vm.runInNewContext(runner+';globalThis.run=runCodexTranslation;',context);
  return {child,controller,run:context.run,
    observe(promise){promise.then(()=>{settled=true;},()=>{settled=true;});return promise;},
    state:()=>({clock,spawns,kills,removals,writes,timer,settled})};
}

test('absolute CLI deadline includes executable resolution and spawn cost', async () => {
  const f=deadlineRunnerFixture({resolveCost:5000,spawnCost:3000});
  const pending=f.run('PRIVATE_PROMPT',25000,null,{
    deadlineMonotonicMs:25000,signal:f.controller.signal,model:'gpt-6.1-sol',reasoningEffort:'medium',
  });
  assert.equal(f.state().timer.ms,17000);
  f.child.emit('close',0);
  assert.equal(await pending,'safe result');
});

test('deadline expired during executable resolution rejects before spawn', async () => {
  const f=deadlineRunnerFixture({resolveCost:25000});
  await assert.rejects(f.run('PRIVATE_PROMPT',25000,null,{
    deadlineMonotonicMs:25000,signal:f.controller.signal,
  }),error=>error.code==='CODEX_TIMEOUT');
  assert.equal(f.state().spawns,0);
  assert.equal(f.state().writes,0);
});

test('abort during executable resolution rejects before spawn', async () => {
  const f=deadlineRunnerFixture({abortDuringResolve:true});
  await assert.rejects(f.run('PRIVATE_PROMPT',25000,null,{
    deadlineMonotonicMs:25000,signal:f.controller.signal,
  }),error=>error.code==='CODEX_CANCELLED');
  assert.equal(f.state().spawns,0);
});

test('spawn exhausting deadline kills owned child but waits for real close', async () => {
  const f=deadlineRunnerFixture({spawnCost:25001}),events=[];
  const pending=f.observe(f.run('PRIVATE_PROMPT',25000,null,{
    deadlineMonotonicMs:25000,signal:f.controller.signal,onProgress:event=>events.push(event),
  }));
  await Promise.resolve();
  assert.equal(f.state().kills,1);
  assert.equal(f.state().writes,0);
  assert.equal(f.state().settled,false);
  assert.equal(f.state().removals,0);
  f.child.emit('close',null);
  await assert.rejects(pending,error=>error.code==='CODEX_TIMEOUT');
  assert.equal(f.state().removals,1);
  assert.equal(events.at(-1).phase,'provider_closed');
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_|safe result/);
});

test('actual Explain adapter forwards absolute deadline and progress callback', async () => {
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'bridge-host.cjs'),'utf8');
  const wiring=source.slice(source.indexOf('const explainSelectionHost ='),
    source.indexOf('let ClassicLevelCtor'));
  let forwarded;
  const context={
    createSmartImageFinder: nativeOnlySmartFinder,
    require:id=>{assert.equal(id,'./explain-selection-host.cjs');return {createExplainHost:deps=>deps};},
    runCodexTranslation(...args){forwarded=args;return Promise.resolve('fixture');},
  };
  vm.runInNewContext(wiring+';globalThis.adapter=explainSelectionHost;',context);
  const signal=new AbortController().signal,onProgress=()=>{};
  await context.adapter.runModel('PRIVATE_PROMPT',{signal,onProgress,deadlineMonotonicMs:12345});
  assert.equal(forwarded[1],25000);
  assert.equal(forwarded[3].deadlineMonotonicMs,12345);
  assert.equal(forwarded[3].onProgress,onProgress);
  assert.equal(forwarded[3].signal,signal);
  assert.equal(forwarded[3].model,'gpt-6.1-sol');
  assert.equal(forwarded[3].reasoningEffort,'medium');
  assert.equal(forwarded[3].localSceneOnly,true);
});

test('normalizes Turkish inflection through model output without mutating notes', async () => {
  let options, prompt;
  const host = createExplainHost({runModel: async (p, o) => {prompt=p; options=o; return JSON.stringify(valid);}, findImages: async () => []});
  const result = await call(host);
  assert.equal(result?.term, 'karaağaç');
  assert.equal(result.summary, valid.summary);
  assert.equal(result.model, 'gpt-6.1-sol');
  assert.equal(result.reasoningEffort, 'medium');
  assert.equal(result.readOnly, true);
  assert.equal(result.mutationApplied, false);
  assert.equal(result.cached, false);
  assert.ok(result.durationMs >= 0);
  assert.equal(options.model, 'gpt-6.1-sol');
  assert.equal(options.reasoningEffort, 'medium');
  assert.ok(options.signal instanceof AbortSignal);
  assert.match(prompt, /karaağaçları/);
  assert.match(prompt, /untrusted/i);
  assert.match(prompt, /recognizable overall appearance/i);
  assert.match(prompt, /scientific name only when known/i);
  assert.match(prompt, /not just flowers/i);
  assert.match(prompt, /common English noun phrase first/i);
  assert.match(prompt, /2-4 words/i);
  assert.match(prompt, /scientific name.*last/i);
  assert.match(prompt, /elm tree Ulmus/);
  assert.match(prompt, /avoid.*adjectives.*search sentences/i);
});

test('ambiguous context is part of cache key and concurrent requests coalesce', async () => {
  let count=0;
  const host = createExplainHost({runModel: async p => {count++; await new Promise(r => setImmediate(r)); return {...valid,term:'yüz',summary:p.includes('yüzme') ? 'Yüzmek suda ilerlemektir. Burada fiil kullanılmıştır.' : 'Yüz başın ön kısmıdır. Burada isim kullanılmıştır.'};},findImages:async()=>[]});
  const results = await Promise.all([call(host,'yüz','yüzme'),call(host,'yüz','yüzme')]);
  assert.equal(count,1);
  assert.equal(results[0].summary,results[1].summary);
  assert.equal((await call(host,'yüz','yüzme')).cached,true);
  assert.notEqual((await call(host,'yüz','yüz ifadesi')).summary,results[0].summary);
  assert.equal(count,2);
});

test('only bounded selection and context enter model; image provider never receives document context', async () => {
  let prompt, imageQuery, imageOptions;
  const host=createExplainHost({runModel:async p=>{prompt=p;return valid;},findImages:async(q,o)=>{imageQuery=q;imageOptions=o;return [];}});
  await host('host_explain_summary',{selectedText:'a'.repeat(300)+'SELECTION_SECRET',contextText:'b'.repeat(600)+'CONTEXT_SECRET',pdf:'PDF_SECRET',model:'old'});
  assert.ok(!prompt.includes('SECRET'));
  await host('host_explain_images',{selectedText:'a'.repeat(200),contextText:'PDF_SECRET',pdf:'PDF_SECRET',limit:100});
  assert.equal(imageQuery.length,160);
  assert.equal(imageOptions.limit,5);
  assert.deepEqual(Object.keys(imageOptions).sort(),['limit','signal']);
});

test('rejects malformed, HTML, too long and noncompact model replies and clears failures', async () => {
  const bad=['not JSON',{...valid,summary:'<script>alert(1)</script>'},{...valid,summary:'a'.repeat(701)},{...valid,summary:'Tek cümle.'},{...valid,uncertain:'false'},{...valid,visualQuery:'a'.repeat(161)}];
  for(const value of bad){
    let count=0;
    const host=createExplainHost({runModel:async()=> (++count===1 ? value : valid),findImages:async()=>[]});
    await assert.rejects(call(host),/EXPLAIN_INVALID_RESPONSE/);
    assert.equal((await call(host)).term,'karaağaç');
    assert.equal(count,2);
  }
});

test('public HTTPS candidates only; metadata is plain text and source-labelled', async () => {
  const bad=['http://example.com/x','javascript:alert(1)','https://user:pass@example.com/x','https://localhost/x','https://127.0.0.1/x','https://10.0.0.1/x','https://172.16.0.1/x','https://192.168.1.1/x','https://169.254.1.1/x','https://[::1]/x','https://[fc00::1]/x','https://[::ffff:192.168.1.1]/x','https://foo.local/x','https://2130706433/x'];
  const candidates=bad.map(imageUrl=>({imageUrl,sourceUrl:'https://example.com/source',title:'bad'}));
  candidates.push({imageUrl:'https://images.example.com/elm.jpg',thumbnailUrl:'https://127.0.0.1/thumb',sourceUrl:'https://example.com/elm',title:'Elm',license:'CC BY',creator:'Botanist'});
  candidates.push({imageUrl:'https://images.example.com/a.jpg',sourceUrl:'https://10.0.0.1/source',title:'bad source'});
  candidates.push({imageUrl:'https://images.example.com/b.jpg',sourceUrl:'https://example.com/source',title:'<img onerror=alert(1)>'});
  const host=createExplainHost({runModel:async()=>valid,findImages:async()=>candidates});
  const result=await host('host_explain_images',{selectedText:'karaağaçları'});
  assert.equal(result?.candidates.length,1);
  assert.deepEqual(result.candidates[0],{imageUrl:'https://images.example.com/elm.jpg',sourceUrl:'https://example.com/elm',title:'Elm',license:'CC BY',creator:'Botanist'});
  assert.equal(result.readOnly,true);
  assert.equal(result.mutationApplied,false);
});

test('raw images start independently; refined query uses distinct cache and failures never spoil summary', async () => {
  const queries=[];
  const host=createExplainHost({runModel:async()=>valid,findImages:async q=>{queries.push(q);if(q==='karaağaçları')throw Error('provider down');return [];}});
  await assert.rejects(host('host_explain_images',{selectedText:'karaağaçları'}),/provider down/);
  assert.equal((await call(host)).term,'karaağaç');
  await host('host_explain_images',{selectedText:'karaağaçları',visualQuery:'elm tree leaves'});
  await host('host_explain_images',{selectedText:'karaağaçları',visualQuery:'elm tree leaves'});
  assert.deepEqual(queries,['karaağaçları','elm tree leaves']);
});

test('cache is bounded to fifty entries and expires after five minutes', async () => {
  let count=0;
  const host=createExplainHost({runModel:async()=>{count++;return valid;},findImages:async()=>[]});
  for(let i=0;i<51;i++) await call(host,String(i));
  await call(host,'0');
  assert.equal(count,52);
  const original=Date.now;
  try {Date.now=()=>original()+300001; await call(host,'0');} finally {Date.now=original;}
  assert.equal(count,53);
});

test('empty selection and unknown action reject without calling providers', async () => {
  const host=createExplainHost({runModel:()=>{throw Error('unexpected model');},findImages:()=>{throw Error('unexpected images');}});
  await assert.rejects(call(host,' '),/EXPLAIN_SELECTION_REQUIRED/);
  await assert.rejects(host('write_note',{}),/EXPLAIN_UNKNOWN_ACTION/);
});

test('image candidates are limited, coalesced and isolated from consumer mutation', async () => {
  let count=0;
  const host=createExplainHost({runModel:async()=>valid,findImages:async()=>{
    count++;
    await new Promise(r=>setImmediate(r));
    return Array.from({length:8},(_,i)=>({imageUrl:`https://images.example.com/${i}.jpg`,sourceUrl:'https://example.com/source',title:`Tree ${i}`}));
  }});
  const [first,second]=await Promise.all([host('host_explain_images',{selectedText:'elm',limit:3}),host('host_explain_images',{selectedText:'elm',limit:3})]);
  assert.equal(first.candidates.length,3);
  assert.equal(count,1);
  first.candidates[0].title='changed';
  assert.equal(second.candidates[0].title,'Tree 0');
  assert.equal((await host('host_explain_images',{selectedText:'elm',limit:3})).candidates[0].title,'Tree 0');
});

test('fifty simultaneous requests cannot silently evict running ownership', async () => {
  const resolvers=[];
  const host=createExplainHost({runModel:()=>new Promise(resolve=>resolvers.push(resolve)),findImages:async()=>[]});
  const jobs=Array.from({length:50},(_,i)=>call(host,String(i)));
  await assert.rejects(call(host,'extra'),/EXPLAIN_CAPACITY/);
  const duplicate=call(host,'0');
  assert.equal(resolvers.length,50);
  resolvers.forEach(resolve=>resolve(valid));
  await Promise.all(jobs);
  assert.equal((await duplicate).term,'karaağaç');
});

test('Unicode expansion cannot exceed external selection, context or image query budgets', async () => {
  let data,query;
  const host=createExplainHost({runModel:async prompt=>{data=JSON.parse(prompt.split('BEGIN_UNTRUSTED_DATA\n')[1].split('\nEND_UNTRUSTED_DATA')[0]);return valid;},findImages:async q=>{query=q;return [];}});
  await host('host_explain_summary',{selectedText:'\u0344'.repeat(300),contextText:'\u0344'.repeat(600)});
  assert.equal(data.selectedText.length,300);
  assert.equal(data.contextText.length,600);
  await host('host_explain_images',{selectedText:'elm',visualQuery:'\u0344'.repeat(160)});
  assert.equal(query.length,160);
  await host('host_explain_images',{selectedText:'\u0344'.repeat(300)});
  assert.equal(query.length,160);
});

test('ignored abort retains actual provider ownership after timeout until settlement', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let started=0,settled=0;
  const resolvers=[];
  const host=createExplainHost({runModel:async()=>valid,findImages:()=>{started++;return new Promise(resolve=>resolvers.push(()=>{settled++;resolve([]);}));}});
  for(let i=0;i<50;i++){
    const rejected=assert.rejects(host('host_explain_images',{selectedText:String(i)}),/EXPLAIN_TIMEOUT/);
    await Promise.resolve();
    t.mock.timers.tick(25000);
    await rejected;
  }
  assert.equal(started,50);
  assert.equal(settled,0);
  const extra=host('host_explain_images',{selectedText:'extra'});
  const extraRejected=assert.rejects(extra,/EXPLAIN_CAPACITY/);
  t.mock.timers.tick(25000);
  await extraRejected;
  await assert.rejects(host('host_explain_images',{selectedText:'0'}),/EXPLAIN_TIMEOUT/);
  assert.equal(started,50);
  resolvers[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  const next=host('host_explain_images',{selectedText:'new'});
  await Promise.resolve();
  assert.equal(started,51);
  resolvers.at(-1)();
  assert.deepEqual((await next).candidates,[]);
  assert.equal(settled,2);
});

test('25 second deadline aborts cooperative model and permits retry after real settlement', async () => {
  let count=0,signal;
  const host=createExplainHost({runModel:async(_p,o)=>{count++;signal=o.signal;if(count===1)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('provider aborted')),{once:true}));return valid;},findImages:async()=>[]});
  await assert.rejects(call(host),/EXPLAIN_TIMEOUT/);
  assert.equal(signal.aborted,true);
  assert.equal((await call(host)).term,'karaağaç');
});
