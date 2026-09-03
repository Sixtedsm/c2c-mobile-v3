<template>
  <div class="outing-document-body">
    <images-box :document="document" />

    <div class="columns is-multiline is-block-print">
      <!-- Hidden in preview. The map is an OpenLayers instance, and one
           mounted inside a modal it was never sized for renders as a blank
           box — a visibly broken element in the very screen meant to build
           confidence before publishing. The trace is reviewed on the form,
           which has a properly sized map of its own. -->
      <div v-if="!preview" class="column is-3 no-print">
        <map-box :document="document" />
        <tool-box v-if="!$screen.isMobile" :document="document" />
      </div>

      <div class="column is-12-print" :class="preview ? 'is-12' : 'is-9'">
        <div class="box">
          <div class="no-print" v-for="route of document.associations.routes" :key="route.document_id">
            <pretty-route-link :route="route" hide-area hide-orientation />
          </div>

          <div>
            <!-- API anti-pattern :
                associations.users should have been called associations.profiles
                as it refers to profiles document
                let stay profile coherent and call this component profiles-links
                and not users-links -->
            <profiles-links :profiles="document.associations.users" />
            <span v-if="document.cooked.participants">, {{ document.cooked.participants }}</span>
          </div>

          <hr />

          <div class="columns">
            <div class="column is-4">
              <activities-field :document="document" />
              <field-view :document="document" :field="fields.frequentation" />
              <field-view :document="document" :field="fields.condition_rating" />
              <field-view v-if="document.partial_trip" :document="document" :field="fields.partial_trip" />

              <field-view :document="document" :field="fields.participant_count" />
            </div>

            <div class="column is-4">
              <label-value :label="$gettext('ratings')">
                <document-rating :document="document" show-helper />
              </label-value>

              <!-- Access block -->
              <field-view v-if="document.public_transport" :document="document" :field="fields.public_transport" />
              <field-view :document="document" :field="fields.access_condition" />
              <field-view :document="document" :field="fields.lift_status" />
              <field-view :document="document" :field="fields.hut_status" />
            </div>

            <div class="column is-4">
              <!-- elevation block  -->
              <double-numeric-field
                :document="document"
                :field1="fields.elevation_min"
                :field2="fields.elevation_max"
                :label="$gettext('elevation')"
              />

              <field-view :document="document" :field="fields.elevation_access" />
              <double-numeric-field
                :document="document"
                :field1="fields.height_diff_up"
                :field2="fields.height_diff_down"
                :label="$gettext('height_diff')"
                show-signs
              />
              <label-value v-if="document.length_total" :label="$gettext('length_total')">
                {{ totalLength.value }}&nbsp;{{ totalLength.unit }}
              </label-value>

              <!-- snow block -->
              <field-view :document="document" :field="fields.elevation_up_snow" />
              <field-view :document="document" :field="fields.elevation_down_snow" />
              <field-view :document="document" :field="fields.snow_quantity" />
              <field-view :document="document" :field="fields.snow_quality" />
              <field-view :document="document" :field="fields.glacier_rating" />
              <field-view :document="document" :field="fields.avalanche_signs" />
            </div>
          </div>
        </div>

        <div class="box">
          <markdown-section :document="document" :field="fields.route_description" />
          <markdown-section :document="document" :field="fields.weather" />
          <markdown-section :document="document" :field="fields.conditions" />

          <condition-levels :data="locale.conditions_levels" />

          <markdown-section :document="document" :field="fields.avalanches" />
          <markdown-section :document="document" :field="fields.timing" />
          <markdown-section :document="document" :field="fields.access_comment" />
          <markdown-section :document="document" :field="fields.hut_comment" />
          <markdown-section :document="document" :field="fields.description" :title="$gettext('personal comments')" />

          <div style="clear: both" />
        </div>

        <tool-box v-if="!preview && $screen.isMobile" :document="document" />

        <comments-box v-if="!preview" :document="document" />
      </div>
      <document-print-license v-if="!preview" :document="document" />
    </div>
  </div>
</template>

<script>
// The rendering of an outing, extracted from OutingView so that the outing
// preview (CDC §4.4) shows the real thing rather than an approximation of
// it. There is one renderer, used twice — a second one would drift the day
// somebody adds a field to the view and forgets the preview.
//
// It needs only `document`: `fields` comes from the type definition and
// `locale` is the cooked locale carried on the document itself, exactly as
// document-view-mixin derives them.
import ConditionLevels from './field-viewers/ConditionLevels';

import constants from '@/js/constants';
import { distance } from '@/pwa/units';

export default {
  components: {
    ConditionLevels,
  },

  props: {
    document: {
      type: Object,
      required: true,
    },
    // Only set on the version-comparison view.
    version: {
      type: Object,
      default: null,
    },
    // Rendering a draft that has not been published: hide everything that
    // acts on a stored document.
    preview: {
      type: Boolean,
      default: false,
    },
  },

  computed: {
    fields() {
      return constants.objectDefinitions.outing.fields;
    },

    locale() {
      return this.document?.cooked;
    },

    // The only distance printed straight from the template rather than
    // through a field renderer (CDC §2.9).
    totalLength() {
      return distance(this.document.length_total, this.$appSettings?.units);
    },
  },
};
</script>
