# Refactoring

Identify the complexity that should disappear, such as a duplicated fact, scattered change, leaky interface, or unnecessary concept. Trace the relevant callers and ownership before choosing a simpler shape.

Preserve the observable behavior that matters to those callers. Use existing evidence where it is adequate and investigate uncertain behavior before changing it. Move callers to the new owner and remove the obsolete path. Retain compatibility only for real consumers that need it.

Judge the result by what became easier to understand, change, or use. Moving the same decisions into more files is not simplification. Check behavior put at risk by the structural change. If the work also needs a material behavior change, resolve that scope with the user rather than disguising it as equivalent behavior.
