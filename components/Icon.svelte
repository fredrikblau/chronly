<script lang="ts" module>
  /**
   * Chronly's icon set: simple 24×24 stroke drawings, drawn for this project so
   * there is no third-party asset to track. Each entry lists the SVG shapes to
   * draw, rendered as real elements (no innerHTML, which store reviewers flag).
   * Add a new icon by adding a key here; the name type follows automatically.
   */
  type Shape = ['path' | 'circle' | 'rect', Record<string, string>]

  const ICONS = {
    clock: [
      ['circle', { cx: '12', cy: '12', r: '9' }],
      ['path', { d: 'M12 7v5l3 2' }],
    ],
    alarm: [
      ['circle', { cx: '12', cy: '13', r: '7.5' }],
      ['path', { d: 'M12 9.5V13l2.2 1.6M4.5 4.8 2.5 6.8M19.5 4.8l2 2M7 20l-1.2 1.6M17 20l1.2 1.6' }],
    ],
    timer: [
      [
        'path',
        {
          d: 'M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 1.6 3.2L12 11.5l2.4-1.8A4 4 0 0 0 16 6.5V3M8 21v-3.5a4 4 0 0 1 1.6-3.2L12 12.5l2.4 1.8a4 4 0 0 1 1.6 3.2V21',
        },
      ],
    ],
    stopwatch: [
      ['circle', { cx: '12', cy: '14', r: '7.5' }],
      ['path', { d: 'M12 14V10.5M10 2.5h4M12 2.5v4M18.5 6.5 20 5' }],
    ],
    globe: [
      ['circle', { cx: '12', cy: '12', r: '9' }],
      ['path', { d: 'M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z' }],
    ],
    focus: [
      ['circle', { cx: '12', cy: '12', r: '8.5' }],
      ['circle', { cx: '12', cy: '12', r: '4.5' }],
      ['circle', { cx: '12', cy: '12', r: '0.8', fill: 'currentColor' }],
    ],
    settings: [
      ['circle', { cx: '12', cy: '12', r: '3' }],
      [
        'path',
        {
          d: 'M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7',
        },
      ],
      ['circle', { cx: '12', cy: '12', r: '6.6' }],
    ],
    bell: [
      ['path', { d: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z' }],
      ['path', { d: 'M10 21h4' }],
    ],
    plus: [['path', { d: 'M12 5v14M5 12h14' }]],
    trash: [['path', { d: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 11v5.5M13.5 11v5.5' }]],
    edit: [
      ['path', { d: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z' }],
      ['path', { d: 'm13.5 6.5 4 4' }],
    ],
    calendar: [
      ['rect', { x: '3.5', y: '5', width: '17', height: '15', rx: '2.5' }],
      ['path', { d: 'M3.5 10h17M8 3v4M16 3v4' }],
    ],
    download: [['path', { d: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14' }]],
    upload: [['path', { d: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14' }]],
    play: [['path', { d: 'M8 5.5v13l10.5-6.5Z', fill: 'currentColor' }]],
    pause: [['path', { d: 'M9 5.5v13M15 5.5v13' }]],
    stop: [['rect', { x: '6.5', y: '6.5', width: '11', height: '11', rx: '1.5' }]],
    skip: [
      ['path', { d: 'M6 6v12l8.5-6Z' }],
      ['path', { d: 'M18 6v12' }],
    ],
    restart: [
      ['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3' }],
      ['path', { d: 'M4.5 4.5v4h4' }],
    ],
    close: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
    up: [['path', { d: 'm6 15 6-6 6 6' }]],
    down: [['path', { d: 'm6 9 6 6 6-6' }]],
    right: [['path', { d: 'm9 6 6 6-6 6' }]],
    volume: [
      ['path', { d: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z' }],
      ['path', { d: 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11' }],
    ],
    snooze: [['path', { d: 'M4 4.5h5l-5 6h5M13 10.5h7l-7 9h7' }]],
    check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
    star: [['path', { d: 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9Z' }]],
    github: [
      [
        'path',
        {
          d: 'M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21',
        },
      ],
    ],
    bug: [
      ['rect', { x: '7.5', y: '8', width: '9', height: '12', rx: '4.5' }],
      [
        'path',
        { d: 'M12 12v8M9.5 8a2.5 2.5 0 0 1 5 0M3.5 13h4M16.5 13h4M4.5 8.5l3 2M19.5 8.5l-3 2M4.5 19l3-2M19.5 19l-3-2' },
      ],
    ],
    shield: [
      ['path', { d: 'M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6Z' }],
      ['path', { d: 'm9 12 2.2 2.2L15.5 10' }],
    ],
    sun: [
      ['circle', { cx: '12', cy: '12', r: '4' }],
      [
        'path',
        {
          d: 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
        },
      ],
    ],
    moon: [['path', { d: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z' }]],
    auto: [
      ['circle', { cx: '12', cy: '12', r: '8.5' }],
      ['path', { d: 'M12 3.5a8.5 8.5 0 0 1 0 17Z', fill: 'currentColor' }],
    ],
    coffee: [
      ['path', { d: 'M4.5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z' }],
      ['path', { d: 'M16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-1.5M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5' }],
    ],
    keyboard: [
      ['rect', { x: '2.5', y: '6', width: '19', height: '12', rx: '2.5' }],
      ['path', { d: 'M6.5 10h1M10 10h1M13.5 10h1M17 10h.5M6.5 14h11' }],
    ],
  } as const satisfies Record<string, readonly Shape[]>

  export type IconName = keyof typeof ICONS
</script>

<script lang="ts">
  interface Props {
    name: IconName
    size?: number | string
    strokeWidth?: number
    class?: string
  }

  const { name, size = '1em', strokeWidth = 1.8, class: className = '' }: Props = $props()
</script>

<svg
  class="icon {className}"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each ICONS[name] as [tag, attributes], index (index)}
    <svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attributes} />
  {/each}
</svg>

<style>
  .icon {
    display: block;
    flex: 0 0 auto;
  }
</style>
