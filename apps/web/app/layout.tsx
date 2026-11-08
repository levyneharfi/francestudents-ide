import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "FranceStudent Web — Votre espace de réflexion", description: "Un espace personnel pour explorer, écrire et organiser vos idées. Démonstration privée et personnalisable.", icons: { icon: "/favicon.svg" } };
const boot = `(function(){try{var p=JSON.parse(localStorage.getItem('francestudent:web:v1:appearance')||'null')||{};if(p.userId!=='demo-local')p={};var t=['dark','light','system'].includes(p.theme)?p.theme:'dark';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.dataset.font=['times','georgia','arial','system'].includes(p.font)?p.font:'times';var a=/^#[0-9a-f]{6}$/i.test(p.accent||'')?p.accent:(d?'#eeeeeb':'#252523');r.style.setProperty('--accent',a);var c=a.slice(1).match(/.{2}/g).map(function(x){var n=parseInt(x,16)/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)});r.style.setProperty('--on-accent',(.2126*c[0]+.7152*c[1]+.0722*c[2])>.179?'#000000':'#ffffff');}catch(e){}})();`;
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr" data-theme="dark" data-font="times" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: boot }} /></head><body>{children}</body></html>;
}
