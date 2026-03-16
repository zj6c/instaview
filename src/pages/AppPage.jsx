import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { parseIG, normTitle, resolveBlob } from '../utils/parser'
import {
  getConversations, upsertConversation, deleteConversation,
  getMessages, insertMessages, deleteMessages,
  uploadMedia, getMediaUrl
} from '../lib/db'
import Bubble from '../components/Bubble'
import Lightbox from '../components/Lightbox'
import { LogOut, Plus, Trash2, Upload, Image as ImgIcon, Search, X, Loader2 } from 'lucide-react'

export default function AppPage() {

const { user, signOut } = useAuth()
const navigate = useNavigate()

const [convs,setConvs]=useState([])
const [msgsMap,setMsgsMap]=useState({})
const [blobsMap,setBlobsMap]=useState({})
const [activeId,setActiveId]=useState(null)

const [lightbox,setLightbox]=useState(null)
const [loading,setLoading]=useState(true)
const [saving,setSaving]=useState(false)

const [query,setQuery]=useState('')
const [searching,setSearching]=useState(false)

const htmlRef=useRef()
const mediaRef=useRef()
const bodyRef=useRef()

/* تحميل المحادثات */

useEffect(()=>{
loadConvs()
},[])

async function loadConvs(){
try{
const data=await getConversations()
setConvs(data.map(c=>({
id:c.id,
name:c.name,
titleKey:c.title_key,
outName:c.out_name
})))
}
catch(e){
console.error(e)
}
finally{
setLoading(false)
}
}

/* تحميل الرسائل */

async function loadMsgs(convId){

if(msgsMap[convId])return

try{

const msgs=await getMessages(convId)

setMsgsMap(p=>({
...p,
[convId]:msgs
}))

resolveStorageBlobs(convId,msgs)

}catch(e){
console.error(e)
}

}

/* ربط الوسائط */

async function resolveStorageBlobs(convId,msgs){

const refs=[...new Set(
msgs
.filter(m=>m.media)
.map(m=>m.media.ref)
.filter(Boolean)
)]

if(!refs.length)return

const entries={}

await Promise.all(refs.map(async ref=>{

const url=await getMediaUrl(convId,ref)

if(url){

entries[ref]=url
entries[ref.replace(/\.[^.]+$/,'')]=url

const clean=ref
.replace(/^audio_/,'')
.replace(/^video_/,'')
.replace(/^image_/,'')
.replace(/^photo_/,'')

entries[clean]=url

}

}))

if(Object.keys(entries).length)

setBlobsMap(p=>({
...p,
[convId]:{
...(p[convId]||{}),
...entries
}
}))

}

/* رفع HTML */

const onHtmlFiles=useCallback(async(files)=>{

const arr=Array.from(files).filter(f=>/\.html?$/i.test(f.name))
if(!arr.length)return

setSaving(true)

try{

const batch=await Promise.all(arr.map((f,i)=>new Promise(resolve=>{

const r=new FileReader()

r.onload=ev=>resolve(
parseIG(ev.target.result,`f${Date.now()}_${i}`)
)

r.readAsText(f,'UTF-8')

})))

const groups={}

for(const result of batch){

const tk=normTitle(result.convName)

if(!groups[tk]){

groups[tk]={
...result,
allMsgs:[...result.msgs]
}

}else{

groups[tk].allMsgs.push(...result.msgs)

}

}

let lastId=null

for(const [tk,group] of Object.entries(groups)){

const sorted=group.allMsgs
.sort((a,b)=>(a.ts&&b.ts)?a.ts-b.ts:0)

const unique=Array.from(
new Map(sorted.map(m=>[m.id,m])).values()
)

const existing=convs.find(c=>c.titleKey===tk)

let convId

if(existing){

convId=existing.id

await upsertConversation({
id:convId,
name:existing.name,
titleKey:tk,
outName:group.outName||existing.outName
})

/* حذف الرسائل القديمة */

await deleteMessages(convId)

/* إدخال الرسائل الجديدة */

await insertMessages(convId,unique)

setMsgsMap(p=>({
...p,
[convId]:unique
}))

}else{

const saved=await upsertConversation({
name:group.convName,
titleKey:tk,
outName:group.outName
})

convId=saved.id

await insertMessages(convId,unique)

setConvs(p=>[
...p,
{
id:convId,
name:group.convName,
titleKey:tk,
outName:group.outName
}
])

setMsgsMap(p=>({
...p,
[convId]:unique
}))

}

lastId=convId

}

if(lastId){

setActiveId(lastId)
await loadMsgs(lastId)

}

}catch(e){

console.error(e)
alert("خطأ: "+e.message)

}
finally{
setSaving(false)
}

},[convs,msgsMap])

/* رفع الوسائط */

const onMediaFiles=useCallback(async(files)=>{

if(!activeId)return

setSaving(true)

try{

const entries={}

await Promise.all(Array.from(files).map(async f=>{

let url

try{

url=await uploadMedia(f,activeId)

}catch{

url=URL.createObjectURL(f)

}

entries[f.name]=url
entries[f.name.replace(/\.[^.]+$/,'')]=url

const clean=f.name
.replace(/^audio_/,'')
.replace(/^video_/,'')
.replace(/^image_/,'')
.replace(/^photo_/,'')
.replace(/\.[^.]+$/,'')

entries[clean]=url

}))

setBlobsMap(p=>({
...p,
[activeId]:{
...(p[activeId]||{}),
...entries
}
}))

}catch(e){

console.error(e)

}
finally{

setSaving(false)

}

},[activeId])

/* حذف محادثة */

const delConv=async(id)=>{

await deleteMessages(id)
await deleteConversation(id)

setConvs(p=>p.filter(c=>c.id!==id))

}

/* اختيار محادثة */

const selectConv=async(id)=>{

setActiveId(id)
setQuery('')
setSearching(false)

await loadMsgs(id)

}

/* التمرير التلقائي */

useEffect(()=>{

if(bodyRef.current&&!searching){

setTimeout(()=>{
bodyRef.current.scrollTop=bodyRef.current.scrollHeight
},80)

}

},[activeId,msgsMap])

/* البيانات النشطة */

const activeConv=convs.find(c=>c.id===activeId)
const activeMsgs=msgsMap[activeId]||[]
const activeBlobs=blobsMap[activeId]||{}

const filteredMsgs=query.trim()
?activeMsgs.filter(m=>m.text?.toLowerCase().includes(query.toLowerCase()))
:activeMsgs

return(

<div className="flex h-screen overflow-hidden bg-[#090909]">

<div className="flex-1 flex flex-col">

{activeConv ? (

<div ref={bodyRef} className="flex-1 overflow-y-auto p-4">

{filteredMsgs.map(msg=>{

let blobUrl=''

if(msg.media?.ref){

blobUrl=
resolveBlob(activeBlobs,{},msg.media.ref)
||activeBlobs[msg.media.ref]
||activeBlobs[msg.media.ref?.replace(/\.[^.]+$/,'')]
||activeBlobs[msg.media.ref?.replace(/^audio_|^video_|^image_|^photo_/,'')]

}

return(

<Bubble
key={msg.id}
msg={msg}
blobUrl={blobUrl}
onImageClick={src=>setLightbox({src,type:'image'})}
onVideoClick={src=>setLightbox({src,type:'video'})}
/>

)

})}

</div>

):(

<div className="flex-1 flex items-center justify-center text-gray-500">

قم برفع ملف محادثة Instagram

</div>

)}

</div>

{lightbox &&
<Lightbox
src={lightbox.src}
type={lightbox.type}
onClose={()=>setLightbox(null)}
/>}

<input
ref={htmlRef}
type="file"
accept=".html"
multiple
className="hidden"
onChange={e=>{
onHtmlFiles(e.target.files)
e.target.value=''
}}
/>

<input
ref={mediaRef}
type="file"
accept="image/*,video/*,audio/*"
multiple
className="hidden"
onChange={e=>{
onMediaFiles(e.target.files)
e.target.value=''
}}
/>

</div>

)

}