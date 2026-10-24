"""Dataset adapters. Only this module knows about netlists or meshes."""
from pathlib import Path
import ctypes as C
import hashlib
import json
import time
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import reverse_cuthill_mckee
from .paths import ROOT, digest

ASSETS = {"netlist": ROOT / "assets/picorv32.json", "mesh": ROOT / "assets/ogre.obj"}

def ptr(a, typ):
    return a.ctypes.data_as(C.POINTER(typ))

class Hypergraph(C.Structure):
    _fields_ = [("vertices", C.c_int32), ("edges", C.c_int32)] + [
        (k, C.POINTER(C.c_int32)) for k in ("offsets", "pins", "incident_offsets", "incident_edges")]

class Params(C.Structure):
    _fields_ = [("parts", C.c_int32), ("passes", C.c_int32), ("seed", C.c_int32), ("imbalance", C.c_double)]

def prepare_netlist(path):
    module = json.loads(path.read_text())["modules"]["picorv32"]
    cells = sorted(module["cells"])
    nets = {}
    for i, name in enumerate(cells):
        for bits in module["cells"][name]["connections"].values():
            for bit in set(bits):
                if isinstance(bit, int): nets.setdefault(bit, set()).add(i)
    edges = [sorted(v) for _, v in sorted(nets.items()) if len(v) > 1]
    offsets = np.array([0] + list(np.cumsum([len(e) for e in edges])), dtype=np.int32)
    pins = np.array([v for edge in edges for v in edge], dtype=np.int32)
    incident = [[] for _ in cells]
    for e, vs in enumerate(edges):
        for v in vs: incident[v].append(e)
    io = np.array([0] + list(np.cumsum([len(e) for e in incident])), dtype=np.int32)
    ie = np.array([e for inc in incident for e in inc], dtype=np.int32)
    # A deterministic connectivity ordering, not a physical chip placement.
    pairs = [(e[0], v) for e in edges for v in e[1:]]
    rows = [a for a,b in pairs] + [b for a,b in pairs]
    cols = [b for a,b in pairs] + [a for a,b in pairs]
    adj = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(cells),len(cells))).tocsr()
    order = reverse_cuthill_mckee(adj, symmetric_mode=True)
    rank = np.empty(len(cells), dtype=np.int32); rank[order] = np.arange(len(cells))
    width = int(np.ceil(np.sqrt(len(cells)*1.35)))
    xy = np.column_stack((rank % width, rank // width)).astype(float)
    xy[:,0] += np.random.default_rng(42).uniform(-.12,.12,len(cells))
    xy -= xy.mean(axis=0); xy /= max(np.ptp(xy,axis=0))
    return {"offsets":offsets, "pins":pins, "incident_offsets":io, "incident_edges":ie,
            "positions":xy, "links":np.asarray(pairs,dtype=np.int32)}, {"cells":cells,"vertices":len(cells),"edges":len(edges)}

def prepare_mesh(path):
    vertices, faces = [], []
    for line in path.read_text().splitlines():
        if line.startswith("v "): vertices.append([float(v) for v in line.split()[1:4]])
        elif line.startswith("f "):
            indices = [int(v.split('/')[0]) for v in line.split()[1:]]
            indices = [i-1 if i>0 else len(vertices)+i for i in indices]
            for i in range(1,len(indices)-1): faces.append([indices[0],indices[i],indices[i+1]])
    v, f = np.array(vertices,dtype=np.float64), np.array(faces,dtype=np.int32)
    if not len(v) or not len(f) or f.min()<0 or f.max()>=len(v): raise ValueError("Invalid OBJ geometry")
    center = (v.min(axis=0)+v.max(axis=0))/2
    diagonal = float(np.linalg.norm(v.max(axis=0)-v.min(axis=0)))
    v = np.ascontiguousarray((v-center)/diagonal)
    # Face normals and adjacency belong to the prepared snapshot for extensions.
    normals = np.cross(v[f[:,1]]-v[f[:,0]], v[f[:,2]]-v[f[:,0]])
    normals /= np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-20)
    return {"vertices":v,"faces":f,"normals":normals}, {"vertices":len(v),"triangles":len(f),"source_diagonal":diagonal}

class Prepared:
    def __init__(self, dataset, state_dir, engine=None, fresh=False, snapshot=None):
        self.dataset = dataset
        start = time.perf_counter()
        path = ASSETS[dataset]
        source_hash = digest(path)
        # Adapter source is part of the preparation identity; incompatible changes
        # cannot silently reuse an old prepared file.
        self.id = hashlib.sha256((dataset+source_hash+digest(__file__)).encode()).hexdigest()[:24]
        directory = Path(state_dir)/"prepared"/(snapshot or self.id)
        cached = (directory/"state.npz").exists() and not fresh
        if cached:
            meta = json.loads((directory/"manifest.json").read_text())
            if digest(directory/"state.npz") != meta["state_sha256"]: raise ValueError("Prepared snapshot checksum mismatch")
            self.id = meta["id"]
            self.meta = meta
            with np.load(directory/"state.npz",allow_pickle=False) as z: self.arrays = {k:np.ascontiguousarray(z[k]) for k in z.files}
        else:
            if snapshot: raise ValueError("Prepared snapshot missing")
            self.arrays, info = (prepare_netlist if dataset=="netlist" else prepare_mesh)(path)
            self.meta = {**info,"id":self.id,"dataset":dataset,"source_sha256":source_hash,"adapter_sha256":digest(__file__)}
            if not fresh:
                directory.mkdir(parents=True,exist_ok=True)
                np.savez(directory/"state.npz",**self.arrays)
                (directory/("input.json" if dataset=="netlist" else "input.obj")).write_bytes(path.read_bytes())
                self.meta["state_sha256"] = digest(directory/"state.npz")
                (directory/"manifest.json").write_text(json.dumps(self.meta))
        self.meta["restored"] = cached
        self.meta["bytes"] = sum(a.nbytes for a in self.arrays.values())
        if dataset=="mesh":
            self.engine = C.CDLL(str(engine))
            self.engine.mesh_prepare.argtypes = [C.c_int,C.POINTER(C.c_double),C.c_int,C.POINTER(C.c_int32)]
            self.engine.mesh_prepare.restype = C.c_void_p
            v, f = self.arrays["vertices"], self.arrays["faces"]
            self.context = self.engine.mesh_prepare(len(v),ptr(v,C.c_double),len(f),ptr(f,C.c_int32))
            self.engine.mesh_run.argtypes = [C.c_void_p,C.c_void_p,C.c_int,C.c_double,C.POINTER(C.c_double),C.POINTER(C.c_int32),C.POINTER(C.c_double),C.POINTER(C.c_int32),C.POINTER(C.c_double)]
            self.engine.mesh_run.restype = C.c_int
        self.meta["prepare_ms"] = (time.perf_counter()-start)*1000
        self.meta["prepare_count"] = 1

    def view(self):
        a = self.arrays
        if self.dataset=="netlist":
            return {"positions":a["positions"].tolist(),"links":a["links"].tolist(),"offsets":a["offsets"].tolist(),"pins":a["pins"].tolist(),"meta":self.meta}
        return {"positions":a["vertices"].ravel().tolist(),"faces":a["faces"].ravel().tolist(),"meta":self.meta}

    def run(self, library, params):
        lib = C.CDLL(str(library))
        if lib.relive_abi()!=1: raise ValueError("Unsupported plugin ABI (expected 1)")
        a = self.arrays
        if self.dataset=="netlist":
            n = self.meta["vertices"]; k = params["parts"]
            g = Hypergraph(n,self.meta["edges"],*[ptr(a[key],C.c_int32) for key in ("offsets","pins","incident_offsets","incident_edges")])
            out = np.zeros(n,dtype=np.int32)
            p = Params(k,params["passes"],params["seed"],params["imbalance"])
            lib.partition.argtypes=[C.POINTER(Hypergraph),C.POINTER(Params),C.POINTER(C.c_int32)]
            start = time.perf_counter(); status = lib.partition(C.byref(g),C.byref(p),ptr(out,C.c_int32)); elapsed=(time.perf_counter()-start)*1000
            if status!=0 or out.min()<0 or out.max()>=k: raise ValueError("Invalid native partition result")
            connectivity = np.array([len(set(out[a["pins"][a["offsets"][e]:a["offsets"][e+1]]])) for e in range(g.edges)])
            sizes = np.bincount(out,minlength=k).tolist()
            return {"partitions":out.tolist(),"metrics":{"cut_nets":int((connectivity>1).sum()),"connectivity":int((connectivity-1).sum()),"balance":round(max(sizes)/(n/k)-1,5),"sizes":sizes,"algorithm_ms":elapsed}}
        v,f=a["vertices"],a["faces"]
        positions=np.zeros_like(v); faces=np.zeros_like(f); errors=np.zeros(len(v)); sizes=np.zeros(3,dtype=np.int32); timings=np.zeros(2)
        target=max(20,int(len(f)*params["ratio"]))
        status=self.engine.mesh_run(self.context,C.cast(lib.edge_cost,C.c_void_p),target,params["feature_weight"],ptr(positions,C.c_double),ptr(faces,C.c_int32),ptr(errors,C.c_double),ptr(sizes,C.c_int32),ptr(timings,C.c_double))
        if status!=0: raise ValueError(f"Native mesh engine returned {status}")
        positions=positions[:sizes[0]]; faces=faces[:sizes[1]]
        if not np.isfinite(positions).all() or not np.isfinite(errors).all() or faces.min()<0 or faces.max()>=len(positions): raise ValueError("Invalid native geometry")
        return {"positions":positions.ravel().tolist(),"faces":faces.ravel().tolist(),"errors":errors.tolist(),"metrics":{"triangles":int(sizes[1]),"vertices":int(sizes[0]),"target_reached":bool(sizes[2]),"algorithm_ms":float(timings[0]),"evaluation_ms":float(timings[1]),"rms_error":float(np.sqrt(np.mean(errors**2))),"max_error":float(errors.max())}}
