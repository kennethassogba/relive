import React,{useEffect,useState} from 'react';
import {Check,Copy,Save,RefreshCw,FileCode2,X} from 'lucide-react';
import {api} from './api';
export default function SourceEditor({project,open,onClose,onError}) {
  const [file,setFile]=useState(null),[source,setSource]=useState(''),[saved,setSaved]=useState(false),[loading,setLoading]=useState(false);
  async function load(){try{const f=await api('source/'+project);setFile(f);setSource(f.source);setSaved(false);}catch(e){onError(e.message);}}
  useEffect(()=>{if(open)load();},[project,open]);
  const save=async()=>{setLoading(true);try{const r=await api('save',{project,source,base_sha256:file.sha256});setFile({...file,sha256:r.sha256});setSaved(true);}catch(e){onError(e.message);}finally{setLoading(false);}};
  if(!open)return null;
  return <section className="editor" aria-label="Native source editor">
    <div className="editor-heading"><span><FileCode2 size={16}/><code>{file?.path||'Loading source…'}</code></span><div><button onClick={load} title="Reload from disk" aria-label="Reload source from disk"><RefreshCw size={15}/></button><button onClick={onClose} aria-label="Close source editor"><X size={17}/></button></div></div>
    <div className="editor-note">This is your working file. Save here or in your usual editor.</div>
    <textarea spellCheck="false" aria-label="Native algorithm source" value={source} onChange={e=>{setSource(e.target.value);setSaved(false);}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save();}}}/>
    <footer><span>Compiled on your machine · {project==='mesh-rust'?'Rust':'C++17'}</span><button className="primary" disabled={!file||loading} onClick={save}>{saved?<Check size={15}/>:<Save size={15}/>} {saved?'Saved to disk':'Save & run'}</button></footer>
  </section>;
}
