# v1 is a desktop application only

v1 ships as a Theia desktop (Electron) application with an installer meant to be as frictionless as possible. A browser version (zero install, but no instrument access and USB only through WebSerial) and a hybrid (Design and simulation in the browser, bench on desktop) were rejected for v1: the Lab workbench needs local USB and instrument access, and a hybrid doubles the test matrix before the first user study.
