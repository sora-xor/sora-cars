# Local Street synthetic unit modules

The authoritative reusable proof implementation and browser exporter live in the selected Iroha Core checkout. No local raw execution, terminal, operand or cryptographic proof mirror remains.

The four remaining Rust modules (`street_graph`, `street_geometry`, `street_handling`, and `street_hazards`) serve synthetic geometry/handling/hazard unit runners. They are not the source of generated game assets or Core proof qualification. The generated layout remains metadata bound to the selected native source. Street browser generation invokes the selected Iroha CLI, whose scalar graph and reference evaluator share the production compiler recipe and fixed catalog.

The retired raw execution runners' arithmetic, carry, alias, fixed-port, terminal, padding and identity obligations now target current native tests. [Current native coverage and remaining checks](../../docs/native-research-retirement.md) identifies those owners. Pending tests must pass against the installed native source before claiming their qualification; deleting old code does not qualify proof soundness, ledger finality or full races.

Historical source snapshots remain under `output/qualification/unused-proof-mirror-retirement-20261018/preimage/`, `output/qualification/native-street-export-20261018/preimage/app/`, and `output/qualification/raw-execution-retirement-20261018/preimage/app/`. Active scripts do not import these snapshots. Previous reports retain their original source identities and are not current qualification results.
