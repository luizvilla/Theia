# The product is a custom Theia application, not a VS Code extension pack

The tool ships as a branded Eclipse Theia application (as Arduino IDE 2 and TI Code Composer Studio 20 do) rather than as extensions inside VS Code. Theia gives control of the shell: layouts per workbench, removal of generic IDE clutter, own installer and branding, and Theia AI built in. It still runs VS Code extensions, so PlatformIO, C/C++ and Python support are reused rather than rebuilt. The cost is maintaining an IDE distribution and depending on Theia perspectives, which are experimental as of Theia 1.74.
