"use client";
import { useState } from 'react';
import { api } from '@/lib/client';
import { Feedback, message } from './shared';
export default function PasswordForm({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section className="editor"><button disabled={busy} onClick={onBack}>← Mis informes</button><h1>Cambiar contraseña</h1><p>Al guardar se cerrarán tus sesiones. Vuelve a ingresar con tu nueva contraseña.</p><form onSubmit={async e=>{e.preventDefault();const form=new FormData(e.currentTarget);setError('');if(form.get('nueva')!==form.get('confirmacion')){setError('Las contraseñas nuevas no coinciden.');return;}setBusy(true);try{await api('v1/auth/password','POST',{actual:form.get('actual'),nueva:form.get('nueva')});onChanged();}catch(err){setError(message(err));}finally{setBusy(false);}}}><label>Contraseña actual<input name="actual" type="password" autoComplete="current-password" required maxLength={128}/></label><label>Nueva contraseña<input name="nueva" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label><label>Repite la nueva contraseña<input name="confirmacion" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label><Feedback error={error}/><button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar contraseña'}</button></form></section>;
}
