import { toast } from 'bulma-toast';

import AssociationsInputRow from './AssociationsInputRow';
import EditionContainer from './EditionContainer';
import FormField from './FormField';
import FormInput from './FormInput';
import FormRow from './FormRow';
import FormSection from './FormSection';
import MapInputRow from './MapInputRow';
import QualityField from './QualityField';

import c2c from '@/js/apis/c2c';
import constants from '@/js/constants';
import ol from '@/js/libs/ol';
import noRobotsMixin from '@/js/no-robots-mixin';

const geoJSONFormat = new ol.format.GeoJSON();
const FORM_PROJ = 'EPSG:4326';
const DATA_PROJ = 'EPSG:3857';

export default {
  components: {
    FormRow,

    FormSection,
    FormField,
    QualityField,
    FormInput,
    MapInputRow,
    EditionContainer,
    AssociationsInputRow,
  },

  mixins: [noRobotsMixin],

  data() {
    return {
      promise: {},
      fields: null, // keep fields here to set them reactive
      saving: false,
      modified: false,
    };
  },

  computed: {
    mode() {
      return this.$route.name.split('-')[1]; // right part of route name : add or edit
    },

    documentType() {
      return this.$route.name.replace(/-(edit|add)/, '');
    },

    documentId() {
      return this.$route.params.id;
    },

    lang() {
      return this.$route.params.lang;
    },

    document() {
      return this.promise.data;
    },

    editedLocale() {
      // in edit mode, there is only one locale
      return this.document ? this.document.locales[0] : null;
    },
  },

  watch: {
    $route: {
      handler: 'load',
      immediate: true,
    },
    'document.geometry.geom': 'setLatitudeLongitude',
  },

  mounted() {
    window.addEventListener('beforeunload', this.beforeUnload);
  },

  beforeDestroy() {
    window.removeEventListener('beforeunload', this.beforeUnload);
  },

  beforeRouteLeave(to, from, next) {
    if (this.modified) {
      const answer = window.confirm(this.$gettext('Do you really want to leave? you have unsaved changes!'));
      if (answer) {
        next();
      } else {
        next(false);
      }
    } else {
      next();
    }
  },

  methods: {
    load() {
      this.fields = constants.objectDefinitions[this.documentType].fields;
      this.cleanErrors();
      this.latitude = null;
      this.longitude = null;

      // as this method will be called in any case,
      // we must check that the user is logged
      // redirection is made be beforeRouteEnter()
      // but we do not want to do anything in this case
      if (!this.$user.isLogged) {
        return;
      }

      if (this.mode === 'edit') {
        this.promise = c2c[this.documentType].get(this.documentId, this.lang).then((response) => {
          const locales = response.data.locales;

          if (!locales.length) {
            // it's a translation from an existing doc
            locales.push(this.$documentUtils.buildLocale(this.documentType, this.lang));
          }

          this.afterLoad(response);

          // TODO : implement an algorithm to determine if document has been modified
          this.modified = true;
        });
      } else {
        // CREATE mode: build an empty document and expose it to the template
        // SYNCHRONOUSLY. Previously the form was hidden behind a loading
        // counter that only reached zero after every association lookup had
        // resolved — meaning a single stalled or failed request would leave
        // the user staring at a blank page when tapping "+ outing". Render
        // first, enrich associations as they arrive: this is the robust path.
        const document = this.$documentUtils.buildDocument(this.documentType, this.lang);
        this.promise = { data: document, loading: 0 };

        let pending = 0;
        const settleOne = () => {
          pending -= 1;
          this.promise.loading = pending;
          if (pending === 0) {
            // TODO : implements a algorithm to determine if document has been modified
            this.modified = true;
            this.afterLoad();
          }
        };

        // Auto-associate the current user on a new outing. Two-step:
        // (1) immediately add a stub from local $user data so the form
        //     is submittable offline without waiting on the API; (2) try
        //     to fetch the full profile to replace the stub with richer
        //     metadata. The stub alone is sufficient for the API
        //     validation (participant required).
        if (this.documentType === 'outing' && this.$user.id) {
          const userStub = {
            type: 'u',
            document_id: this.$user.id,
            name: this.$user.name || this.$user.userName || '',
            forum_username: this.$user.forumUsername,
          };
          this.$documentUtils.addAssociation(document, userStub);

          pending += 1;
          this.promise.loading = pending;
          const profileFetch = c2c.profile.get(this.$user.id);
          profileFetch.then((response) => {
            // Replace the stub with the full profile so the displayed
            // card shows avatar + activities + etc.
            this.$documentUtils.removeAssociation(document, userStub);
            this.$documentUtils.addAssociation(document, response.data);
          });
          profileFetch.promise_.then(settleOne, settleOne);
        }

        // Pre-fill associations from URL query (e.g. ?r=12345 → preselect
        // route). Tries the API first; on failure, falls back to the
        // offline cache if the user saved that doc — important when the
        // user lands on /outings/add from a saved route's detail page
        // without network.
        for (const letter of Object.keys(this.$route.query)) {
          const associationType = this.$documentUtils.getDocumentType(letter);

          if (associationType && this.$route.query[letter]) {
            const documentIds = String(this.$route.query[letter]).split(',');

            for (const documentId of documentIds) {
              pending += 1;
              this.promise.loading = pending;
              const fetcher = c2c[associationType].get(documentId);
              fetcher.then((response) => {
                this.$documentUtils.addAssociation(document, response.data);
              });
              fetcher.promise_.then(settleOne, () => {
                // API failed (offline / 404 / etc.) — try the offline cache.
                this.tryOfflineAssociation(document, associationType, documentId).finally(settleOne);
              });
            }
          }
        }

        if (this.$route.query.act) {
          document.activities = this.$route.query.act.split(',');
        }

        // If nothing was scheduled, fire afterLoad immediately.
        if (pending === 0) {
          this.modified = true;
          this.afterLoad();
        }
      }
    },

    // Offline fallback for ?r=<id> / ?w=<id> / ?u=<id> preselection in
    // create mode. If the C2C API isn't reachable but the doc is in the
    // user's offline cache, build an association entry from the cached
    // data. Returns a resolved promise either way — the caller threads
    // it into `settleOne` without caring about the outcome.
    async tryOfflineAssociation(document, associationType, documentId) {
      if (!this.$offline) return;
      try {
        const lang = this.lang || this.$user?.lang || 'fr';
        const entry = await this.$offline.getDocument(associationType, documentId, lang);
        if (entry?.data) {
          this.$documentUtils.addAssociation(document, entry.data);
        }
      } catch {
        // No offline copy either — give up silently. The user can still
        // submit (some associations are optional, and the form already
        // surfaces validation errors at save time).
      }
    },

    setGeometryPoint() {
      if (this.latitude === null || this.longitude === null) {
        return;
      }

      const longitude = parseFloat(String(this.longitude).replace(',', '.'));
      const latitude = parseFloat(String(this.latitude).replace(',', '.'));

      const point = new ol.geom.Point([longitude, latitude]);
      point.transform(FORM_PROJ, DATA_PROJ);
      this.document.geometry.geom = geoJSONFormat.writeGeometry(point);
    },

    setLatitudeLongitude() {
      if (!this.document || !this.document.geometry || !this.document.geometry.geom) {
        return {};
      }

      const point = geoJSONFormat.readGeometry(this.document.geometry.geom);

      point.transform(DATA_PROJ, FORM_PROJ);

      const coords = point.getCoordinates();

      this.longitude = Math.round(coords[0] * 1000000) / 1000000;
      this.latitude = Math.round(coords[1] * 1000000) / 1000000;
    },

    afterLoad() {},

    beforeSave() {},

    afterSave() {},

    // display a popup with info from fields that contains an error
    // return true if popup is displayed, false otherwise
    displayErrors(isApiMessage) {
      const fieldsWithError = this.getFieldsWithError();
      const i18nContext = isApiMessage ? 'API message' : undefined;

      // list of possible API message (keep js syntax, for messages extraction)
      // $gettext('Shorter than minimum length 1', 'API message');
      // $gettext('at least one route required', 'API message');
      // $gettext('at least one user required', 'API message');
      // $gettext('This field must be a valid ISBN.', 'API message');

      if (fieldsWithError.length !== 0) {
        const messages = fieldsWithError.map(
          (field) => `${this.$gettext(field.name)} : ${this.$gettext(field.error.description, i18nContext)}`
        );

        toast({ message: `<ul><li>${messages.join('</li><li>')}</li></ul>`, type: 'is-danger', position: 'center' });

        return true;
      }

      return false;
    },

    save(comment) {
      if (this.lang === 'eu' && !this.$user.isModerator) {
        toast({
          message: this.$gettext(
            "Sorry, euskara lang has been frozen.\nWe're looking for a moderator, if you're interested, please contact board@camptocamp.org"
          ),
          type: 'is-danger',
          position: 'center',
        });
        return;
      }

      this.beforeSave(); // allow each view to handle some specific cases

      this.computeErrors();

      if (this.displayErrors(false)) {
        return;
      }

      // Offline create-outing path: if the user is creating a new outing while
      // disconnected, queue it locally; the $offline plugin will retry the POST
      // automatically when the device comes back online. The behaviour is
      // limited to outings on purpose (other doc types are wiki-style edits
      // that we do not want to silently defer).
      if (this.mode === 'add' && this.documentType === 'outing' && this.$offline && !this.$offline.online) {
        this.saving = true;
        this.$offline
          .queueOuting(this.document)
          .then(() => {
            this.modified = false;
            toast({
              message: this.$gettext('Outing saved locally — it will be published when you are back online.'),
              type: 'is-success',
              position: 'center',
              duration: 5000,
            });
            this.$router.push({ name: 'offline' });
          })
          .catch(() => {
            this.saving = false;
            toast({
              message: this.$gettext('Could not save your outing locally. Please try again.'),
              type: 'is-danger',
              position: 'center',
            });
          });
        this.afterSave();
        return;
      }

      let promise;

      this.saving = true;

      if (this.mode === 'edit') {
        promise = c2c[this.documentType].save(this.document, comment).then(() => {
          this.modified = false;
          this.goToDocument(this.document.document_id);
        });
      } else {
        promise = c2c[this.documentType].create(this.document).then((response) => {
          this.modified = false;
          this.goToDocument(response.data.document_id);
        });
      }

      this.afterSave(); // allow each view to handle some specific cases

      promise.catch((error) => {
        this.saving = false;
        // Network error fallback: if we lost connection mid-save when creating
        // an outing, queue it instead of dropping the user's work on the floor.
        if (
          this.mode === 'add' &&
          this.documentType === 'outing' &&
          this.$offline &&
          !error?.response &&
          !navigator.onLine
        ) {
          this.$offline.queueOuting(this.document).then(() => {
            this.modified = false;
            toast({
              message: this.$gettext('Network lost — your outing was saved locally and will sync later.'),
              type: 'is-warning',
              position: 'center',
              duration: 5000,
            });
            this.$router.push({ name: 'offline' });
          });
          return;
        }
        const data = error?.response?.data;
        if (data?.errors) {
          this.dispatchErrors(data.errors);
        } else {
          toast({
            message: this.$gettext('An error occurred while saving. Please try again.'),
            type: 'is-danger',
            position: 'center',
          });
        }
      });
    },

    // after saving, go to document
    // when it's a creation, id is in request's response.
    goToDocument(documentId) {
      this.$router.push({
        name: this.documentType,
        params: {
          id: documentId,
          lang: this.lang,
        },
      });
    },

    computeErrors() {
      for (const field of Object.values(this.fields)) {
        field.error = field.getError(this.document, this.editedLocale);
      }
    },

    getFieldsWithError() {
      return Object.values(this.fields).filter((field) => field.error !== null);
    },

    dispatchErrors(errors) {
      // TODO : errors === undefined ?
      this.cleanErrors();

      for (const error of errors) {
        const path = error.name.split('.');

        if (path[0] === 'locales') {
          this.dispatchError(path[2], error);
        } else if (path[0] === 'associations') {
          this.dispatchError(path[1], error);
        } else {
          this.dispatchError(path[0], error);
        }
      }

      this.displayErrors(true);
    },

    dispatchError(fieldName, error) {
      if (this.fields[fieldName] === undefined) {
        // $gettext('Conflict: version of locale \'en\' has changed')
        // $gettext('Conflict: version of locale \'es\' has changed')
        // $gettext('Conflict: version of locale \'eu\' has changed')
        // $gettext('Conflict: version of locale \'de\' has changed')
        // $gettext('Conflict: version of locale \'it\' has changed')
        // $gettext('Conflict: version of locale \'ca\' has changed')
        // $gettext('Conflict: version of locale \'fr\' has changed')
        // $gettext('Conflict: version of locale \'sl\' has changed')
        // $gettext('Conflict: version of locale \'zh_CN\' has changed')
        // $gettext('Conflict: version of document has changed')
        toast({ message: this.$gettext(`${error.name}: ${error.description}`), type: 'is-danger', position: 'center' });
      } else {
        this.fields[fieldName].error = error;
      }
    },

    cleanErrors() {
      for (const field of Object.values(this.fields)) {
        field.error = null;
      }
    },

    beforeUnload(event) {
      if (this.modified) {
        event.preventDefault();
        event.returnValue = '';
      }
    },
  },
};
