# Fileglancer Design System

A library of UI-only, reusable components built on our existing Material Tailwind + Tailwind CSS stack. Components live in an atomic hierarchy:

- **atoms/** -- Smallest building blocks (buttons, inputs, badges).
- **molecules/** -- Compositions of atoms (search bars, form fields with labels).
- **organisms/** -- Complex UI sections (dialogs, data tables, nav bars).
- **templates/** -- Page-level layout skeletons that slot in organisms.

Semantic color classes are defined in `tailwind.config.js`.

All design-system components use the `Fg` prefix (e.g. `FgButton`, `FgDialog`) and are previewed in Storybook (`pixi run storybook`).

---

## Authoring Rules

1. **UI-only.** No `useQuery`, no router hooks, no `fetch`, no context unless it's theme-related context.

2. **Props are the contract.** Every variant and state is a prop. If a component needs data, the caller provides it.

3. **Callbacks, not actions.** Emit `onClick`, `onChange`, `onSubmit`. Callers wire them to mutations/navigation.

4. **Composition over configuration.** Prefer compound components (`<FgDialog.Root>`, `<FgDialog.Header>`) over giant prop APIs.

5. **Semantic color classes only, not raw hex.** Use Tailwind classes backed by `mtConfig` (`bg-primary`, `text-foreground`). No new hex values.

6. **No `-default` in color class names.** Per existing convention: `bg-primary`, not `bg-primary-default`.

7. **Every component has a Vitest test.** Minimum: renders with props, emits callbacks, renders correctly in dark mode.

8. **Every component has a Storybook story.** Co-locate `ComponentName.stories.tsx` next to the component file.

9. **Every interactive component has a `focus-visible` style.** Keyboard users must see focus.

10. **`Fg` prefix for all design-system components.** Makes migration greppable and prevents collision with Material Tailwind.
