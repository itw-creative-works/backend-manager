# .runtimeconfig.json Deprecated
* Move all CLI npx bm setup checks to new .env
* Make a standard field that acts as the old .runtimeconfig.json
* It is parsed and inserted into Manager.config so no code changes for the user
* Maybe we can change it to Manager.secrets or Manager.env because Manager.config is stupid name

* NEW FIX
  * Add a bm_api path to firebase.json hosting rewrites. This way we can protect the API behind cloudflare instead of calling the naked firebnase functions URL
