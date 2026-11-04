'use client';
import {MapContainer,TileLayer,CircleMarker,Popup} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
export default function LocationMap({points}:{points:{name:string;latitude:number;longitude:number;orders:number}[]}){
 return <MapContainer center={[18.8,-70.1]} zoom={8} style={{height:380,width:'100%',borderRadius:12}} scrollWheelZoom={false}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors'/>{points.map((p,i)=><CircleMarker key={i} center={[p.latitude,p.longitude]} radius={8} pathOptions={{color:'#6E2A35',fillColor:'#C4603F',fillOpacity:.7}}><Popup>{p.name}: {p.orders} ventas</Popup></CircleMarker>)}</MapContainer>;
}
