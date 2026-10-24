import json
import shutil
from pathlib import Path
import numpy as np
import pytest
from relive.adapters import ROOT, digest, Prepared
from relive.runtime import Runtime, validate_params

@pytest.fixture(scope='module')
def rt(tmp_path_factory):
    state=tmp_path_factory.mktemp('relive'); (state/'build').mkdir()
    for engine in (ROOT/'.relive/build').glob('engine-*.so'): shutil.copyfile(engine,state/'build'/engine.name)
    runtime=Runtime(state,watch=False)
    yield runtime
    runtime.close()

def execute(rt, project, **kw):
    _,future=rt.submit(project,**kw); return future.result(timeout=180)

def result(rt, run):
    return json.loads((rt.state/'runs'/run['id']/'result.json').read_text())

def test_native_partition_changes_and_snapshot_is_retained(rt):
    source=(ROOT/'examples/netlist/partition.cpp').read_text()
    a=execute(rt,'netlist',source=source)
    b=execute(rt,'netlist',source=source.replace('FANOUT_EXPONENT = 0.0','FANOUT_EXPONENT = 1.0'))
    assert a['status']==b['status']=='ready', (a.get('error'),b.get('error'))
    assert a['prepared_id']==b['prepared_id']
    assert a['host_pid']==b['host_pid'] and a['pid']!=b['pid']
    assert result(rt,a)['partitions']!=result(rt,b)['partitions']
    for r in (a,b):
        sizes=r['metrics']['sizes']; n=sum(sizes)
        assert max(sizes)<=np.ceil(n/4*1.05)
        assert len(result(rt,r)['partitions'])==n
        assert r['metrics']['connectivity']>=r['metrics']['cut_nets']>0
    snapshot=rt.state/'prepared'/a['prepared_id']
    manifest=json.loads((snapshot/'manifest.json').read_text())
    assert digest(snapshot/'state.npz')==manifest['state_sha256']

def test_branch_replay_is_deterministic_and_keeps_working_source(rt):
    a=execute(rt,'netlist'); before=(ROOT/'examples/netlist/partition.cpp').read_bytes()
    rt.branch_from(a['id'],'alternate')
    b=execute(rt,'netlist',params=a['params'],source=(rt.state/'runs'/a['id']/a['source_file']).read_text(),replay=a['id'])
    assert b['status']=='ready',b.get('error')
    assert b['parent']==a['id'] and b['prepared_id']==a['prepared_id']
    assert result(rt,a)['partitions']==result(rt,b)['partitions']
    assert before==(ROOT/'examples/netlist/partition.cpp').read_bytes()

def test_build_error_preserves_good_results(rt):
    good=execute(rt,'netlist'); before=digest(rt.state/'runs'/good['id']/'result.json')
    bad=execute(rt,'netlist',source='this is not C++;')
    assert bad['status']=='error' and 'error' in bad['error']
    assert digest(rt.state/'runs'/good['id']/'result.json')==before
    again=execute(rt,'netlist'); assert again['status']=='ready'

def test_crash_does_not_kill_prepared_host(rt):
    good=execute(rt,'netlist')
    source='#include "abi.h"\n#include <csignal>\nextern "C" int relive_abi(){return 1;}\nextern "C" int partition(const Hypergraph*, const PartitionParams*, int32_t*) { raise(SIGSEGV); return 0; }'
    crash=execute(rt,'netlist',source=source)
    assert crash['status']=='error' and 'SIGSEGV' in crash['error']
    again=execute(rt,'netlist'); assert again['status']=='ready'
    assert good['host_pid']==again['host_pid']

def test_abi_rejection(rt):
    source=(ROOT/'examples/netlist/partition.cpp').read_text().replace('relive_abi() { return 1; }','relive_abi() { return 99; }')
    r=execute(rt,'netlist',source=source)
    assert r['status']=='error' and 'Unsupported plugin ABI' in r['error']

def test_native_stdout_cannot_corrupt_protocol(rt):
    source=(ROOT/'examples/netlist/partition.cpp').read_text()
    source='#include <cstdio>\n'+source.replace('const int n =','puts("native debug output"); fflush(stdout); const int n =')
    r=execute(rt,'netlist',source=source)
    assert r['status']=='ready',r.get('error')
    assert 'native debug output' in (rt.state/'runs'/r['id']/'native.log').read_text()

def test_cpp_and_rust_mesh_variants(rt):
    source=(ROOT/'examples/mesh/criterion.cpp').read_text()
    a=execute(rt,'mesh-cpp',source=source)
    b=execute(rt,'mesh-cpp',source=source.replace('FEATURE_BIAS = 0.0','FEATURE_BIAS = 8.0'))
    rust=execute(rt,'mesh-rust')
    assert a['status']==b['status']==rust['status']=='ready',(a.get('error'),b.get('error'),rust.get('error'))
    assert a['prepared_id']==b['prepared_id']==rust['prepared_id']
    assert a['host_pid']==b['host_pid']==rust['host_pid']
    ar,br,rr=result(rt,a),result(rt,b),result(rt,rust)
    assert ar['positions']!=br['positions']
    assert ar['faces']==rr['faces'] and np.allclose(ar['positions'],rr['positions'])
    for r in (a,b,rust):
        out=result(rt,r)
        assert r['metrics']['triangles']<=int(r['prepared']['triangles']*.2)
        assert len(out['faces'])==r['metrics']['triangles']*3
        assert len(out['errors'])==r['prepared']['vertices']
        assert np.all(np.isfinite(out['positions']))
        assert r['metrics']['rms_error']>0

def test_classic_cycle_uses_fresh_host(rt):
    a=execute(rt,'netlist'); b=execute(rt,'netlist',fresh=True)
    assert b['status']=='ready' and not b['cache_hit']
    assert a['host_pid']!=b['host_pid']
    assert result(rt,a)['partitions']==result(rt,b)['partitions']

@pytest.mark.parametrize('values',[{'parts':0,'passes':1,'seed':42,'imbalance':.05},{'parts':4,'passes':1,'seed':42,'imbalance':float('nan')},{'parts':4,'passes':1,'seed':42,'imbalance':-1}])
def test_invalid_parameters_rejected(values):
    with pytest.raises(ValueError): validate_params('netlist',values)

def test_corrupted_snapshot_is_rejected(rt,tmp_path):
    run=execute(rt,'netlist'); snap=run['prepared_id']; dest=tmp_path/'prepared'/snap
    shutil.copytree(rt.state/'prepared'/snap,dest)
    with (dest/'state.npz').open('ab') as f: f.write(b'corrupt')
    with pytest.raises(ValueError,match='checksum'): Prepared('netlist',tmp_path,snapshot=snap)
