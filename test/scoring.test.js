import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreEvidence, deterministicBrief } from '../lib/scoring.js';

function fc(properties = null) { return { type:'FeatureCollection', features: properties ? [{type:'Feature',properties,geometry:null}] : [] }; }
function evidence(overrides = {}) {
  const layer = (data = fc(), count = data.features.length, ok = true) => ({ data, count, ok });
  return {
    point:{lat:32.7765,lng:-79.9311}, address:{address:'100 Test St, Charleston, SC'}, places:Array.from({length:18},(_,i)=>({name:`Place ${i}`})), failures:[],
    layers:{
      zoning:layer(fc({ZONE_BASE:'GB'})),
      flood:layer(fc({ZONE_SUBTY:'Area of Minimal Flood Hazard'})),
      historic:layer(fc()), str:layer(fc()), futureLandUse:layer(fc({LAND_USE:'City Centers'})),
      property:layer(fc({TMS:'123',SALE_PRICE:750000})), countyParcel:layer(fc({PID:'123'})),
      activePermits:layer(fc(),7), newDevelopments:layer(fc(),3), newConstruction:layer(fc(),4), parking:layer(fc(),8), transit:layer(fc(),3)
    }, ...overrides
  };
}

test('business score rewards active, accessible, lower-flood-hazard commercial context',()=>{
  const result=scoreEvidence(evidence(),'business');
  assert.ok(result.score>=70,`expected >=70 got ${result.score}`);
  assert.equal(result.mode,'business');
});

test('elevated flood and historic constraint reduce real-estate signal',()=>{
  const e=evidence();
  e.layers.flood.data=fc({ZONE_SUBTY:'1% Annual Chance Flood Hazard'}); e.layers.flood.count=1;
  e.layers.historic.data=fc({District:'Old and Historic'}); e.layers.historic.count=1;
  const risky=scoreEvidence(e,'realestate');
  const clean=scoreEvidence(evidence(),'realestate');
  assert.ok(risky.score<clean.score,`${risky.score} should be < ${clean.score}`);
});

test('brief states unavailable feeds instead of inventing facts',()=>{
  const e=evidence({failures:[{source:'Flood',error:'timeout'}]});
  e.layers.flood.ok=false; e.layers.flood.data=fc(); e.layers.flood.count=0;
  const brief=deterministicBrief(e,scoreEvidence(e,'business'));
  assert.match(brief,/failed/i);
});
