'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {quantityLimit} from '@/lib/drop';
import {useOrder} from './order-context';
import type {Drop} from '@/types/drop';
export function ReserveButton({drop}:{drop:Drop}){
 const {selection}=useOrder();const router=useRouter();const busy=useRef(false);const [pending,setPending]=useState(false);const [error,setError]=useState('');
 async function reserve(){if(busy.current)return;busy.current=true;setPending(true);setError('');try{const form=new FormData();form.set('operation','hold');form.set('drop_id',drop.id);form.set('quantity',String(Math.min(selection.quantity,quantityLimit(drop))));const response=await fetch('/api/checkout',{method:'POST',body:form});const data=await response.json();if(!response.ok)throw Error(data.error);router.push('/checkout');}catch(e){setError(e instanceof Error?e.message:'No pudimos confirmar la reserva.');router.refresh();}finally{busy.current=false;setPending(false);}}
 return <><button className="button" disabled={pending} onClick={reserve}>{pending?'RESERVANDO…':'RESERVAR DROP'}</button>{error&&<p role="alert" className="field-error">{error}</p>}</>;
}
