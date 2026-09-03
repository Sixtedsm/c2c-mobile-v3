<template>
  <label-value v-if="hasValue1 && hasValue2" :label="label">
    <span>{{ signPlus }}{{ displayed1.value }}&nbsp;{{ displayed1.unit }}</span>
    <span>/</span>
    <span>{{ signMinus }}{{ displayed2.value }}&nbsp;{{ displayed2.unit }}</span>
  </label-value>
  <field-view v-else-if="hasValue1" :document="document" :field="field1" />
  <field-view v-else-if="hasValue2" :document="document" :field="field2" />
</template>

<script>
import FieldView from './FieldView';
import LabelValue from './LabelValue';

import { requireDocumentProperty } from '@/js/properties-mixins';
import { displayValueAndUnit } from '@/pwa/units';

export default {
  components: {
    LabelValue,
    FieldView,
  },

  mixins: [requireDocumentProperty],

  props: {
    field1: {
      type: Object,
      required: true,
    },
    field2: {
      type: Object,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    showSigns: {
      type: Boolean,
      default: false,
    },
  },

  computed: {
    value1() {
      return this.document[this.field1.name];
    },
    value2() {
      return this.document[this.field2.name];
    },
    // V3 (CDC §2.9). This component prints its own units instead of
    // going through DocumentField, so the preference has to be applied
    // here too — and these are the elevation and height-gain pairs, the
    // figures a reader looks at first.
    displayed1() {
      return displayValueAndUnit(this.value1, this.field1.unit, null, this.$appSettings?.units);
    },
    displayed2() {
      return displayValueAndUnit(this.value2, this.field2.unit, null, this.$appSettings?.units);
    },
    hasValue1() {
      return this.value1 !== null && this.value1 !== undefined;
    },
    hasValue2() {
      return this.value2 !== null && this.value2 !== undefined;
    },
    signPlus() {
      return this.showSigns ? '+' : '';
    },
    signMinus() {
      return this.showSigns ? '-' : '';
    },
  },
};
</script>
