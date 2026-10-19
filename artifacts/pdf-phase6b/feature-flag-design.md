# Feature flag design

`PDF_TO_DOCX_SHADOW_RECONSTRUCTION=true` enables shadow calls. Default OFF and runtime-configurable through the worker/application environment. The flag affects only the shadow helper; disabling it restores pre-6B behavior and no shadow request is made.
