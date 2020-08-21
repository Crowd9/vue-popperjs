import VuePopperjs from "./VuePopperjs.vue";

const Plugin = {
  install(Vue, options = {}) {
    Vue.component(options.name || "vue-popperjs", VuePopperjs);
  }
};

if (typeof window !== "undefined" && window.Vue) {
  window.Vue.use(Plugin);
}

export { VuePopperjs };
export default Plugin;
