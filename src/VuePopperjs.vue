<template>
  <!-- [T1] -->
  <component :is="tag" :id="`${id}-root-fragment`">
    <!--
      @slot wrap reference and popper inside of the slot, use appropriate
        bindings for each one, remaining bindings are for advanced usage
        `{ arrow, reference, popper, id, instance }`
      @binding {object} SlotScope
    -->
    <slot
      v-bind="{
        arrow,
        reference,
        popper,
        id,
        instance: popperInstance
      }"
    />
  </component>
</template>

<script>
import { createPopper } from "@popperjs/core";
import { isEqual, uniqueId } from "lodash-es";

/** @see https://popper.js.org/docs/v2/constructors/#options */
export const POPPER_PLACEMENTS = [
  "auto",
  "auto-start",
  "auto-end",
  "top",
  "top-start",
  "top-end",
  "bottom",
  "bottom-start",
  "bottom-end",
  "right",
  "right-start",
  "right-end",
  "left",
  "left-start",
  "left-end"
];

/** @see https://popper.js.org/docs/v2/constructors/#options */
export const POPPER_STRATEGIES = ["absolute", "fixed"];

const initialState = () => ({
  id: null,
  popperEl: null,
  popperReferenceEl: null,
  popperArrowEl: null,
  popperInstance: null,
  state: {
    styles: {
      popper: {
        position: "absolute",
        left: "0",
        top: "0"
      }
    },
    attributes: {}
  }
});

/**
 * A quasi-renderless popper.js wrapper extended with hide/show
 * functionality for creating all sorts of poppers.
 *
 * @see [T1] - A limitation of current vue.js version is that we don't have
 * fragments, and always need to return a single root node. Will not be
 * necessary in 3.0.
 *
 * @note Props have a one to one match with popper options, with the exception of
 * onFirstUpdate callback, we emit an fist-update event for that.
 *   {@link https://popper.js.org/docs/v2/constructors/#options}
 */
export default {
  name: "VuePopperjs",
  inheritAttrs: false,
  props: {
    /**
     * Positioning of popper if there's space available. Flip is enabled
     * by default, so popper will be positioned on the opposite side if
     * it doesn't have the space.
     */
    placement: {
      type: String,
      default: "bottom-start",
      validator: placement => POPPER_PLACEMENTS.includes(placement)
    },

    /**
     * Popper.js positioning strategy. Only use 'fixed', if you're reference
     * element is fixed as well.
     */
    strategy: {
      type: String,
      default: "absolute",
      validator: placement => POPPER_STRATEGIES.includes(placement)
    },

    /**
     * ** ⚠️ Advanced Usage** —
     * “All the useful functionalities provided by the library are implemented
     * as Popper modifiers. They are plugins, or middlewares, that can hook
     * into the lifecycle of Popper, and add additional logic to the positioning
     * operations provided by default by Popper.”
     * https://popper.js.org/docs/v2/modifiers/
     *
     * @see https://popper.js.org/docs/v2/modifiers/
     */
    modifiers: {
      type: Array,
      default: () => []
    },

    /**
     * NON POPPER.JS RELATED OPTIONS
     */

    /**
     * Custom root tag that will wrap the reference.
     * This will be eliminated as soon as Fragments from v3 arrives. The
     * fact that we can use poppers inside semantic elements, like lists,
     * requires this customization to keep HTML semantically valid.
     */
    tag: {
      type: String,
      default: "span"
    }
  },
  data: () => initialState(),
  computed: {
    $_options() {
      return {
        placement: this.placement,
        strategy: this.strategy,
        modifiers: [
          ...this.modifiers,
          /**
           * Following other wrapper conventions of disabling applyStyles modifier
           * in favor of manual update of state variable which become reactive and
           * can then be computed and binding to our our fake "ref" popper elements.
           *
           * @see https://github.com/popperjs/react-popper/blob/bcc2e0999e121e69f458fa3de610c469e4fddb7a/src/usePopper.js#L52-L72
           * @see https://github.com/popperjs/svelte-popper/blob/master/src/Popper.svelte#L19
           */
          {
            name: "updateState",
            enabled: true,
            phase: "write",
            fn: ({ state }) => {
              const { styles, attributes } = state;
              // @todo think of cleaner way, but watch out for reactivity
              // caveats.
              this.state = {
                styles: {
                  ...this.state.styles,
                  ...styles
                },
                attributes: {
                  ...this.state.attributes,
                  ...attributes
                }
              };
            },
            requires: ["computeStyles"]
          },
          {
            name: "arrow",
            enabled: this.popperArrowEl !== null,
            options: {
              element: this.popperArrowEl
            }
          },
          { name: "applyStyles", enabled: false }
        ]
      };
    },

    popper() {
      return {
        attrs: {
          "data-vue-popper": this.id,
          ...this.state.attributes.popper,
          style: this.state.styles.popper
        }
      };
    },

    reference() {
      return {
        attrs: {
          "data-vue-popper-reference": this.id
        }
      };
    },

    arrow() {
      return {
        attrs: {
          "data-vue-popper-arrow": this.id,
          style: this.state.styles.arrow
        }
      };
    }
  },
  /**
   * Watch prop change, update popper instance.
   */
  watch: {
    placement: "setOptions",
    strategy: "setOptions",
    modifiers: "setOptions"
  },
  /**
   * LIFECYCLE
   */
  created() {
    this._observer = null; // non reactive private property
    this.id = uniqueId("vue-popper-");
  },
  /**
   * Try to boot when DOM is ready. This doesn't guarantee that all required
   + popper.js DOM "refs" are in the DOM. They might not yet (v-if).
   */
  mounted() {
    this.setup();
    this.observe();
  },

  beforeDestroy() {
    this.destroy(true);
    this._observer.disconnect();
    this._observer = null;
  },

  //-/////////////////////////////////////////////////////////////////////
  /**
   * @see [M1] the this.popperInstance verification behind some methods
   * is required because if component data updates some might react to it
   * and if the component "refs" weren't in the DOM before, the instance is
   * not created yet.
   */
  //-/////////////////////////////////////////////////////////////////////

  methods: {
    /**
     * Watch for mutation (v-if) to make sure we still create our popper correctly
     * after conditional loading
     *
     * @note [1]
     *   If we remove root el for vue3, we need to update the observed element
     *   for mutations.
     */
    observe() {
      const config = { childList: true };
      // Callback function to execute when mutations are observed
      const callback = mutationsList => {
        // Use traditional 'for loops' for IE 11
        for (const mutation of mutationsList) {
          const { addedNodes, type } = mutation;

          if (type === "childList" && addedNodes.length) {
            if (addedNodes[0].nodeType === 1) {
              this.setup();
            } else {
              this.destroy();
            }
          }
        }
      };

      this._observer = new MutationObserver(callback);
      this._observer.observe(this.$el, config); // [1]
    },
    /**
     * Gets DOM ref elements. Creates popper instance if they required
     * elements exist.
     *
     * @see [1]
     *   just to make sure we account for portal-vue caveat for consumers
     *   using teleport.
     *   {@link https://portal-vue.linusb.org/guide/caveats.html#refs}
     * @private
     */
    async setup() {
      // [1]
      await this.$nextTick();
      await this.$nextTick();

      // returns true if both "refs" are available
      const refsReady = this.getRefs();

      if (refsReady) {
        this.popperInstance = createPopper(
          this.popperReferenceEl,
          this.popperEl,
          {
            ...this.$_options,
            onFirstUpdate: this.onFirstUpdate
          }
        );
      }
    },

    /**
     * Getting DOM elements required for popper constructor.
     * Not using vue $refs because AFAIK we can't pass them through slot
     * scope so we pass the attributes to be bound to the "refs"
     * element/components and then query the DOM here for the nodes.
     *
     * I would love if any vue master knows a vue-y way.
     *
     * @desc Stores the elements in component instance
     * @return {Boolean} true in case of both refs successfully queried
     * @private
     */
    getRefs() {
      this.popperReferenceEl = document.querySelector(
        `[data-vue-popper-reference="${this.id}"]`
      );
      this.popperEl = document.querySelector(`[data-vue-popper="${this.id}"]`);

      if (this.popperEl) {
        this.popperArrowEl = this.popperEl.querySelector(
          `[data-vue-popper-arrow="${this.id}"]`
        );
      }

      return this.popperReferenceEl !== null && this.popperEl !== null;
    },

    /**
     * Destroys popper instance. Sets data model to a clean state.
     *
     * @param {Boolean} entirely - true if the whole component was removed
     *  from the DOM (actually destroyed). False if only inner elements
     *  did (popper refs) an we need to reboot: here we don't reset id
     *  since it's only defined in created and we would get null after update
     * @private
     */
    destroy(entirely) {
      if (this.popperInstance) this.popperInstance.destroy(); // [m1]

      const cleanState = initialState();

      if (entirely) {
        Object.assign(this.$data, cleanState);
      } else {
        // eslint-disable-next-line
        const { id, ...restState } = cleanState
        Object.assign(this.$data, restState);
      }
    },

    //-///////////////////////////////////////////////////////////////////
    // POPPER.JS API WRAP
    //-///////////////////////////////////////////////////////////////////

    /**
     * If for some extraordinary reason an external component needs
     * to for updated via ref.
     * @public
     */
    forceUpdate() {
      if (this.popperInstance) this.popperInstance.forceUpdate(); // [M1]
    },

    /**
     * It's used internally, but for the same reason as forcedUpdate
     * it might be used in extraordinary cases.
     *
     * @return {Promise} - with
     * @public
     */
    async update() {
      return this.popperInstance && this.popperInstance.update(); // [M1]
    },

    /**
     * Handler for options watcher, make options reactive.
     * @return <Options>
     * @private
     */
    async setOptions(newProp, oldProp) {
      if (isEqual(newProp, oldProp) || !this.popperInstance) return;

      // it returns a popper.update() call internally, so returns a promise
      const state = await this.popperInstance.setOptions(this.$_options);
      this.$emit("set-options", state);
    },

    /**
     * Emitted once when the popper instance is initially created.
     * @private
     */
    onFirstUpdate(state) {
      this.$emit("first-update", state);
    }
  }
};
</script>
