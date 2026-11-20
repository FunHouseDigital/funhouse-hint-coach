# Vendored files

Copied unchanged from npm. Pinned exact versions. Both are MIT (licence in vendor/wllama/LICENCE, same author and licence for the compat package).

| File | From | sha256 |
|---|---|---|
| wllama/index.js | @wllama/wllama@3.13.0 esm/index.js | fffd95c16ca191f31f4303664a05189c43d0cb20c52b67276c04e8857b138b64 |
| wllama/wllama.wasm | @wllama/wllama@3.13.0 esm/wasm/wllama.wasm | 79ac5be917b71d50571a4f584436a9f6baf6b6e57719d094ed8bd950e9a65780 |
| wllama-compat/wllama.js | @wllama/wllama-compat@3.13.0 wasm/wllama.js | 942062a7495790a317061b27a6bcd2bd3b247e2ddef53a069baf5abb07284758 |
| wllama-compat/wllama.wasm | @wllama/wllama-compat@3.13.0 wasm/wllama.wasm | 35df8c1e2f7dbd74b8e8b01054fb9f1fbe86cf566945fbf4cef3965855a8b92e |

The compat build is only used by browsers without WebAssembly JSPI or Memory64 (older Chrome or Edge, Safari). It is served locally, never from a CDN.

To refresh: `npm pack @wllama/wllama@<v>` and `npm pack @wllama/wllama-compat@<v>`, unpack, copy the same files, update this table.
