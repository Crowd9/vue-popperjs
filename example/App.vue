<template>
  <div id="app">
    <div>
      <img alt="Vue logo" src="./assets/logo.png" />
    </div>

    <vue-popperjs #default="{ reference, popper }">
      <span v-bind="reference.attrs">
        Popper will be positioned relative to me
      </span>
      <div v-bind="popper.attrs">
        Popper 🚀
      </div>
    </vue-popperjs>
  </div>
</template>

<script>
import VuePopperjs from "../src/VuePopperjs.vue";

export default {
  name: "App",
  components: {
    VuePopperjs
  }
};
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
