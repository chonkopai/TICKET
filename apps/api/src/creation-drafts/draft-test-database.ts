export const draftDatabaseTests=process.env.EVENT_CREATION_DB_TEST==="true";
if(draftDatabaseTests){
  const database=new URL(process.env.DATABASE_URL??"http://invalid");
  if(!["localhost","127.0.0.1"].includes(database.hostname)||!/^\/event_platform_v2_(fresh|legacy)_\d+$/.test(database.pathname))throw new Error("Draft integration tests require a named isolated v2 rehearsal database");
}
