// Only Node evaluates the filesystem import; browsers fetch the packaged schema.
const url=new URL('./schema/gaia.schema.json',import.meta.url);
export const schema=typeof window==='undefined'
 ? JSON.parse(await (await import('node:fs/promises')).readFile(url,'utf8'))
 : await (await fetch(url)).json();
