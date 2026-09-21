/* Original finite-domain DILR construction. No coaching/PYQ text is copied.
 * A second, exhaustive solver validates the displayed material and every key.
 * Content difficulty is an estimate, never a measured CAT performance claim. */
var MargDILREngine = (function() {
  'use strict';
  var VERSION = 'finite-domain-1';
  var TOPICS = ['Arrangements & Rankings','Scheduling & Allocation','Distribution & Grouping','Games & Tournaments','Routes & Networks','Tables, Charts & DI Caselets','Venn Diagrams & Set Data'];
  function random(seed) {
    var s = seed >>> 0;
    return function(n) { s = (Math.imul(s,1664525) + 1013904223) >>> 0; return Math.floor((s / 4294967296) * n); };
  }
  function shuffle(a, rng) {
    a = a.slice();
    for (var i=a.length-1;i>0;i--) { var j=rng(i+1), t=a[i]; a[i]=a[j]; a[j]=t; }
    return a;
  }
  function holds(c, x) {
    var a=x[c.a], b=x[c.b];
    if (!a || (c.b !== undefined && !b)) return true;
    if (c.op==='before') return a < b;
    if (c.op==='gap') return Math.abs(a-b) === c.k;
    if (c.op==='apart') return Math.abs(a-b) !== 1;
    if (c.op==='sum') return a+b === c.k;
    if (c.op==='parity') return a%2 === b%2;
    if (c.op==='opposite-parity') return a%2 !== b%2;
    if (c.op==='range') return a>=c.lo && a<=c.hi;
    return false;
  }
  // Construction solver: prune assignments as soon as a clue can be checked.
  function constructCases(clues) {
    var out=[], row=Array(8).fill(0);
    function visit(depth, mask) {
      if (depth===8) { out.push(row.slice()); return; }
      for(var v=1;v<=8;v++) if (!(mask & (1<<v))) {
        row[depth]=v;
        if (clues.every(function(c){return holds(c,row);})) visit(depth+1,mask|(1<<v));
      }
      row[depth]=0;
    }
    visit(0,0); return out;
  }
  // Verification solver: enumerate all 8! full permutations lexicographically.
  // No pruning, generated witness, claimed case count or answer key is trusted.
  function independentlySolve(clues) {
    var row=[1,2,3,4,5,6,7,8], out=[];
    do {
      if(clues.every(function(c){return holds(c,row);})) out.push(row.slice());
      var i=6;
      while(i>=0 && row[i]>=row[i+1]) i--;
      if(i<0) break;
      var j=7;
      while(row[j]<=row[i]) j--;
      var t=row[i]; row[i]=row[j]; row[j]=t;
      for(var l=i+1,r=7;l<r;l++,r--) { t=row[l];row[l]=row[r];row[r]=t; }
    } while(true);
    return out;
  }
  function context(topic, scale) {
    var labels=['A','B','C','D','E','F','G','H'];
    var unit='position', title='Exhibition order', preamble='Eight exhibits, labelled A to H, occupy positions 1 to 8 in one row, from left to right.';
    if(topic===TOPICS[1]) { unit='slot'; title='Workshop schedule'; preamble='Eight workshops, labelled A to H, run in eight consecutive slots numbered 1 to 8. There is one workshop in each slot; a smaller slot number means an earlier workshop.'; }
    if(topic===TOPICS[2]) { unit='load';title='Warehouse allocation';preamble='Eight shipments, labelled A to H, receive different loads. The available loads are '+[1,2,3,4,5,6,7,8].map(function(n){return n*scale;}).join(', ')+' crates. Each load is used once. Shipments A to D go to the north warehouse and E to H to the south warehouse.'; }
    if(topic===TOPICS[3]) { unit='score';title='Quiz league scorecard';preamble='Eight teams, labelled A to H, finish a quiz league with distinct total scores. The eight scores are '+[1,2,3,4,5,6,7,8].map(function(n){return n*scale;}).join(', ')+' points, each used once. Each team’s total is the sum of its quiz-round points; there is no assumption about wins, draws or head-to-head results.'; }
    if(topic===TOPICS[4]) { unit='stop';title='Delivery route';preamble='A vehicle visits eight delivery nodes, labelled A to H, exactly once each, in stops 1 to 8. It starts at the first node and ends at the eighth; there is no return trip. Roads connect every pair of nodes in both directions. The restrictions below apply to the order of visits, not to distances.'; }
    if(topic===TOPICS[5]) { unit='sales';title='Two-product sales table';preamble='Four stores sell two products. Let A and B be Store 1’s sales of products X and Y; C and D, Store 2’s; E and F, Store 3’s; G and H, Store 4’s. The eight cell values are '+[1,2,3,4,5,6,7,8].map(function(n){return n*scale;}).join(', ')+' units, each used exactly once.'; }
    if(topic===TOPICS[6]) { unit='count';title='Three-club membership';preamble='A survey records membership in clubs X, Y and Z. A counts X only; B, Y only; C, Z only; D, X and Y but not Z; E, X and Z but not Y; F, Y and Z but not X; G, all three; H, none. These eight disjoint regions contain '+[1,2,3,4,5,6,7,8].map(function(n){return n*scale;}).join(', ')+' people in some order, each value used once. Thus the total survey population is '+36*scale+'.'; }
    var numerical=unit==='load'||unit==='score'||unit==='sales'||unit==='count';
    return { labels:labels, unit:unit, title:title, preamble:preamble, scale:numerical?scale:1, numerical:numerical };
  }
  function clueText(c, ctx) {
    var a=ctx.labels[c.a], b=ctx.labels[c.b], s=ctx.scale, noun=ctx.unit==='sales'?'sales value':ctx.numerical?ctx.unit:ctx.unit+' number';
    if(c.op==='before') return 'The '+noun+' of '+a+' is smaller than that of '+b+'.';
    if(c.op==='gap') return 'The absolute difference between the '+noun+'s of '+a+' and '+b+' is exactly '+c.k*s+'.';
    if(c.op==='apart') return 'The '+noun+'s of '+a+' and '+b+' do not differ by '+s+'.';
    if(c.op==='sum') return 'The '+noun+'s of '+a+' and '+b+' add up to '+c.k*s+'.';
    if(c.op==='parity') return s===1 ? 'The '+noun+'s of '+a+' and '+b+' have the same parity (both odd or both even).' : 'After expressing both '+noun+'s in units of '+s+', '+a+' and '+b+' have the same parity.';
    if(c.op==='opposite-parity') return s===1 ? 'One of the '+noun+'s of '+a+' and '+b+' is odd and the other is even.' : 'After expressing both '+noun+'s in units of '+s+', one of '+a+' and '+b+' is odd and the other is even.';
    if(c.op==='range') return 'The '+noun+' of '+a+' is between '+c.lo*s+' and '+c.hi*s+', inclusive.';
    throw new Error('Unknown clue');
  }
  function candidatePool(truth, rng) {
    var pool=[];
    for(var a=0;a<8;a++) for(var b=a+1;b<8;b++) {
      pool.push({op:'before',a:truth[a]<truth[b]?a:b,b:truth[a]<truth[b]?b:a});
      pool.push({op:'gap',a:a,b:b,k:Math.abs(truth[a]-truth[b])});
      pool.push({op:'sum',a:a,b:b,k:truth[a]+truth[b]});
      pool.push({op:truth[a]%2===truth[b]%2?'parity':'opposite-parity',a:a,b:b});
      if(Math.abs(truth[a]-truth[b])!==1) pool.push({op:'apart',a:a,b:b});
    }
    return shuffle(pool,rng);
  }
  function numericalChoices(answer,rng) {
    var vals=[answer];
    var delta=1;
    while(vals.length<4) { var n=answer+(delta%2 ? Math.ceil(delta/2) : -delta/2); if(n>=0 && vals.indexOf(n)<0) vals.push(n); delta++; }
    return shuffle(vals,rng);
  }
  function deduce(cases, clues, rng) {
    var relations=candidatePool(cases[0],rng).filter(function(c){
      return !clues.some(function(old){return JSON.stringify(old)===JSON.stringify(c);}) && cases.every(function(row){return holds(c,row);});
    });
    return relations.slice(0,3);
  }
  function questionSpecs(cases, clues, rng) {
    var q=[{kind:'cases',choices:numericalChoices(cases.length,rng),answer:cases.length}];
    var variable=shuffle([0,1,2,3,4,5,6,7],rng).find(function(a){return new Set(cases.map(function(r){return r[a];})).size>1;});
    var values=Array.from(new Set(cases.map(function(r){return r[variable];}))).sort(function(a,b){return a-b;});
    var possible=[values];
    for(var value=1;value<=8 && possible.length<4;value++) {
      var altered=values.indexOf(value)<0 ? values.concat(value).sort(function(a,b){return a-b;}) : values.filter(function(v){return v!==value;});
      if(altered.length && !possible.some(function(a){return JSON.stringify(a)===JSON.stringify(altered);})) possible.push(altered);
    }
    q.push({kind:'values',entity:variable,choices:shuffle(possible,rng),answer:values});
    var extraPool=candidatePool(cases[0],rng).filter(function(c){return !clues.some(function(old){return JSON.stringify(c)===JSON.stringify(old);});});
    var conditional=extraPool.find(function(c){var n=cases.filter(function(r){return holds(c,r);}).length;return n>=2 && n<cases.length;});
    if(!conditional) return null;
    var subset=cases.filter(function(r){return holds(conditional,r);});
    var target=shuffle([0,1,2,3,4,5,6,7],rng).find(function(a){return new Set(subset.map(function(r){return r[a];})).size>1;});
    if(target===undefined) target=variable;
    var max=Math.max.apply(null,subset.map(function(r){return r[target];}));
    q.push({kind:'conditional-max',condition:conditional,entity:target,choices:shuffle([1,2,3,4,5,6,7,8].filter(function(v){return v!==max;}),rng).slice(0,3).concat(max),answer:max});
    q[2].choices=shuffle(q[2].choices,rng);
    function isOneClueConsequence(candidate){
      return clues.some(function(clue){
        var samePair=(clue.a===candidate.a&&clue.b===candidate.b)||(clue.a===candidate.b&&clue.b===candidate.a);
        if(!samePair)return false;
        if(candidate.op==='apart'&&(clue.op==='parity'||clue.op==='gap'&&clue.k!==1))return true;
        return false;
      });
    }
    var universal=extraPool.find(function(c){return !isOneClueConsequence(c)&&cases.every(function(r){return holds(c,r);});}) ||
      extraPool.find(function(c){return cases.every(function(r){return holds(c,r);});});
    var notUniversal=extraPool.filter(function(c){return !cases.every(function(r){return holds(c,r);});}).slice(0,3);
    if(!universal || notUniversal.length!==3) return null;
    q.push({kind:'must',choices:shuffle([universal].concat(notUniversal),rng),answer:universal});
    return q;
  }
  function resultFor(spec,cases) {
    if(spec.kind==='cases') return cases.length;
    if(spec.kind==='values') return Array.from(new Set(cases.map(function(r){return r[spec.entity];}))).sort(function(a,b){return a-b;});
    if(spec.kind==='conditional-max') {
      var rows=cases.filter(function(r){return holds(spec.condition,r);});
      if(!rows.length) throw new Error('Impossible hypothetical');
      return Math.max.apply(null,rows.map(function(r){return r[spec.entity];}));
    }
    if(spec.kind==='must') {
      var surviving=spec.choices.filter(function(c){return cases.every(function(r){return holds(c,r);});});
      if(surviving.length!==1) throw new Error('Ambiguous must question');
      return surviving[0];
    }
    throw new Error('Unknown question');
  }
  function renderQuestion(spec,ctx,cases) {
    var q, type, explanation, answer=resultFor(spec,cases), scale=ctx.scale;
    var witness=cases[0].map(function(v,i){return ctx.labels[i]+'='+v*scale;}).join(', ');
    if(spec.kind==='cases') {
      type='case-count';q='How many complete assignments satisfy all the given conditions?';
      explanation='There are '+cases.length+' valid assignments when all conditions are combined. One is '+witness+'. Count complete assignments, not isolated pairs.';
    } else if(spec.kind==='values') {
      type='optimization';q='Which option lists ALL possible '+ctx.unit+' values for '+ctx.labels[spec.entity]+' across the valid assignments?';
      explanation='Combining every condition, '+ctx.labels[spec.entity]+' can take exactly '+answer.map(function(v){return v*scale;}).join(', ')+'. The alternatives either add an impossible value or omit a feasible one.';
    } else if(spec.kind==='conditional-max') {
      type='local-hypothetical';q='For this question ONLY, also assume: '+clueText(spec.condition,ctx)+' What is the maximum possible '+ctx.unit+' of '+ctx.labels[spec.entity]+'?';
      var subset=cases.filter(function(r){return holds(spec.condition,r);});
      var attaining=subset.find(function(r){return r[spec.entity]===answer;});
      explanation='The additional condition leaves '+subset.length+' assignments. The maximum is '+answer*scale+', attained by '+attaining.map(function(v,i){return ctx.labels[i]+'='+v*scale;}).join(', ')+'.';
    } else {
      type='must-cannot';q='Which of the following statements MUST be true in every valid assignment?';
      explanation=clueText(answer,ctx)+' This holds in all '+cases.length+' valid assignments; each alternative fails in at least one valid assignment.';
    }
    var choiceText=spec.choices.map(function(v){return spec.kind==='must'?clueText(v,ctx):Array.isArray(v)?v.map(function(n){return n*scale;}).join(', '):String(v*(spec.kind==='cases'?1:scale));});
    var key=spec.choices.findIndex(function(v){return JSON.stringify(v)===JSON.stringify(answer);});
    if(key<0 || new Set(choiceText).size!==4) throw new Error('Invalid options');
    return {q:q,reasoning_type:type,options:choiceText.map(function(t,i){return 'ABCD'[i]+'. '+t;}),correct:key,explanation:explanation,
      sufficiency_check:'All eight distinct values and every relevant condition are stated; a complete enumeration determines this answer.',
      option_check:'Every option is compared with all feasible assignments, including the local condition where stated; exactly one option survives.',
      common_mistake:'Using a partial case as if it were the only case',marg_insight:'Check all remaining cases before committing to an answer.'};
  }
  function material(proof,cases) {
    var ctx=context(proof.topic,proof.scale);
    var setup=ctx.preamble+' Every value must be used exactly once: two labels cannot receive the same value. All the following conditions hold simultaneously. Do not assume any alphabetical order or any relationship not stated. For a conditional question, apply its extra condition to that question only; it does not change the base cases for the others.\n\n'+proof.clues.map(function(c,i){return (i+1)+'. '+clueText(c,ctx);}).join('\n');
    return {set_title:ctx.title,difficulty:'Medium–Hard',estimated_solve_minutes:16,
      constraint_types:[proof.topic,'Distinct values with interacting order, gap, parity and sum restrictions'],
      derived_constraints:proof.deductions.map(function(c){return clueText(c,ctx);}),setup:setup,
      questions:proof.questions.map(function(s){return renderQuestion(s,ctx,cases);})};
  }
  function create(topic,seed,count) {
    var rng=random(seed), sets=[], proofs=[];
    count=Number(count)||1;
    if(!Number.isInteger(count)||count<1||count>3) throw new Error('DILR supports one to three sets per exercise');
    for(var set=0;set<count;set++) {
      var chosen=TOPICS.indexOf(topic)>=0?topic:TOPICS[rng(TOPICS.length)], completed=false;
      for(var attempt=0;attempt<128 && !completed;attempt++) {
        var truth=shuffle([1,2,3,4,5,6,7,8],rng), pool=candidatePool(truth,rng), clues=[], cases=constructCases([]);
        for(var p=0;p<pool.length && clues.length<9;p++) {
          var next=cases.filter(function(row){return holds(pool[p],row);});
          if(next.length>=6 && next.length<cases.length && next.length>=cases.length*0.10) { clues.push(pool[p]);cases=next; }
        }
        if(clues.length<7 || cases.length>40 || new Set(clues.flatMap(function(c){return [c.a,c.b];})).size!==8) continue;
        // No clue is redundant: removing it must permit additional assignments.
        if(clues.some(function(c,i){return constructCases(clues.filter(function(_,j){return j!==i;})).length===cases.length;})) continue;
        var deductions=deduce(cases,clues,rng), specs=questionSpecs(cases,clues,rng);
        if(deductions.length<3 || !specs) continue;
        var proof={version:VERSION,topic:chosen,scale:1+rng(5),clues:clues,deductions:deductions,questions:specs};
        sets.push(material(proof,cases));proofs.push(proof);completed=true;
      }
      if(!completed) throw new Error('Could not construct a nonredundant DILR set within the bound');
    }
    return {sets:sets,_margConstruction:{version:VERSION,sets:proofs}};
  }
  function verify(data,expectedTopic) {
    try {
      var proof=data && data._margConstruction;
      if(!proof || proof.version!==VERSION || !Array.isArray(proof.sets) || proof.sets.length!==data.sets.length || proof.sets.length<1 || proof.sets.length>3) throw new Error('Missing construction certificate');
      var answers=[], counts=[], witnesses=[], checked=[];
      proof.sets.forEach(function(p,index){
        if(p.version!==VERSION || TOPICS.indexOf(p.topic)<0 || !Number.isInteger(p.scale)||p.scale<1||p.scale>5 || !Array.isArray(p.clues)||p.clues.length<7||p.clues.length>10 || !Array.isArray(p.questions)||p.questions.length!==4 || !Array.isArray(p.deductions)||p.deductions.length!==3) throw new Error('Invalid certificate shape');
        if(expectedTopic && TOPICS.indexOf(expectedTopic)>=0 && p.topic!==expectedTopic) throw new Error('Wrong DILR topic');
        p.clues.concat(p.deductions).forEach(function(c){if(!c || ['before','gap','apart','sum','parity','opposite-parity','range'].indexOf(c.op)<0||!Number.isInteger(c.a)||c.a<0||c.a>7||!Number.isInteger(c.b)||c.b<0||c.b>7||c.a===c.b) throw new Error('Invalid constraint');});
        var cases=independentlySolve(p.clues);
        if(cases.length<6||cases.length>40 || !p.deductions.every(function(c){return cases.every(function(r){return holds(c,r);});})) throw new Error('Unproved case structure');
        var rendered=material(p,cases);
        if(JSON.stringify(rendered)!==JSON.stringify(data.sets[index])) throw new Error('Displayed material or key differs from the solved certificate');
        answers=answers.concat(rendered.questions.map(function(q){return q.correct;}));
        counts.push(cases.length);checked.push(p.clues.length);
        witnesses.push(cases[0].map(function(v,i){return 'ABCDEFGH'[i]+'='+v*context(p.topic,p.scale).scale;}).join(', '));
      });
      return {valid:true,issues:[],verification:{answer_indices:answers,feasible_base_case_counts:counts,base_case_witnesses:witnesses,checked_constraint_counts:checked,method:'exhaustive-code-solver',version:VERSION}};
    } catch(e) {return {valid:false,issues:[String(e.message||e)]};}
  }
  return {create:create,verify:verify,topics:TOPICS.slice(),version:VERSION};
})();
if(typeof module!=='undefined' && module.exports) module.exports=MargDILREngine;
