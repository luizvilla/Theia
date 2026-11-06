# Data objects are declared in YAML and the firmware's C declarations are generated

A firmware's data objects are declared in a `data_objects.yaml` file. The build generates the C/C++ ThingSet declarations (in the style of Core4's `user_data_objects.cpp/h`), which are never edited by hand. The data object table in the application is a view of the YAML. Panels, procedures and test records read the same YAML without parsing C. Keeping the C file as the source, with the table parsing and rewriting it, was rejected as fragile.
