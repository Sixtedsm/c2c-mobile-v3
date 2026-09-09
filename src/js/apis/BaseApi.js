import axios from 'axios';

/// ////////////////////////////////////////////////////////////////////////////////
// Technically, we should do this in any API call to enhance promise with response :
// let result = axios.get(url).then(response => result.response = response)
//
// but, Promise prototype is not writable
// So let's polyfill it, whith a Promise-like object

const ApiData = function (promise) {
  const self = this;

  this.response = null;
  this.error = null;
  this.promise_ = promise;
  this.data = null;
  this.loading = true;

  promise.then(
    (response) => {
      self.loading = false;
      self.response = response;
      self.data = response.data;
    },
    (error) => {
      self.loading = false;
      self.error = error;
    }
  );
};

ApiData.prototype.then = function (successCallback, errorCallback) {
  this.promise_.then(successCallback, errorCallback);
  return this;
};

ApiData.prototype.catch = function (callback) {
  this.promise_.catch(callback);
  return this;
};

// No request to the wiki API is legitimately slower than this. Without a
// timeout a hung POST hangs forever — the offline sync pass stays open
// behind it, and when it finally rejects it carries no response, i.e. the
// one failure class where we cannot tell whether the outing was created.
// Failing fast is what makes that class rare enough to handle honestly.
const REQUEST_TIMEOUT_MS = 60 * 1000;

const BaseApi = function (apiUrl) {
  this.axios = axios.create({
    // axios instances shares same common headers. this trick fix this.
    headers: { common: {} },
    baseURL: apiUrl,
    timeout: REQUEST_TIMEOUT_MS,
  });
};

/*
 * Generic request helpers
 */

BaseApi.prototype.get = function (url, params) {
  return new ApiData(this.axios.get(url, params));
};

BaseApi.prototype.post = function (url, body) {
  return new ApiData(this.axios.post(url, body));
};

BaseApi.prototype.put = function (url, body) {
  return new ApiData(this.axios.put(url, body));
};

BaseApi.prototype.delete = function (url, body) {
  return new ApiData(this.axios.delete(url, body));
};

export default BaseApi;
