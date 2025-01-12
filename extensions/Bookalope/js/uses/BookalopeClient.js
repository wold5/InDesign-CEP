/*
 * This file is cloned from https://github.com/jenstroeger/Bookalope/blob/master/clients/javascript/bookalope.js
 */


/**
 * Helper function that checks if a given string is a Bookalope token or ID;
 * returns true if it is, false otherwise. Note that the function does not
 * check for validity of the string, only its format.
 *
 * @param {string} token - The Bookalope API token or ID string.
 * @returns {boolean} True if the given string is a Bookalope token or ID.
 */

function isToken(token) {
  return new RegExp("^[0-9a-zA-Z_\-]{71}$").test(token || "");
}


/**
 * Helper function that implements an assertion. If the given condition is false,
 * throw an error containing the given message; if the condition is true, do nothing.
 *
 * @param {boolean} condition - A condition to check.
 * @param {string} message - An error string used when the condition is false.
 * @throws {BookalopeError} The given condition must be true.
 */

function assert(condition, message) {
  if (!condition) {
    throw new BookalopeError("Assertion failed: " + message);
  }
}


/**
 * A BookalopeError is raised whenever an API call failed or returned an unexpected
 * HTTP code, when an assertion failed, or any other serious condition arose.
 *
 * @param {string} message - The error message for this instance.
 * @constructor
 */

var BookalopeError = function(message) {
  this.name = "BookalopeError";
  this.message = message || "Error from Bookalope";
};

BookalopeError.prototype = Object.create(Error.prototype);


/**
 * The Bookalope client provides direct access to the Bookalope server and its
 * services, and it wraps REST API calls into convenient functions.
 *
 * @param {string} token - The Bookalope API token used to authenticate calls.
 * @param {boolean} betaHost - True if Bookalope's beta host should be used.
 * @param {string} version - Version of the server API to use.
 * @constructor
 */

var BookalopeClient = function(token, betaHost, version) {
  this.setToken(token);
  this.setHost(betaHost);
  if (version) {
    this._version = version;
  } else {
    this._version = "2.0.0";
  }
};


/**
 * Helper function that performs the actual http request, and returns the
 * Promise which wraps the call and response. Don't call this directly, but
 * use one of the GET, PUT, DELETE helpers instead. Fulfills the promise
 * with returned JSON or downloaded Blob; rejects the promise with a proper
 * BookalopeError.
 *
 * @async
 * @param {string} url - Endpoint to invoke.
 * @param {string} method - GET/POST/DELETE, the REST verb.
 * @param {object} params - Parameters for the call.
 * @param {object} options - Additional properties for the XMLHttpRequest object.
 * @returns {Promise}
 */

BookalopeClient.prototype._httpRequest = function(url, method, params, options) {
  var bookalope = this;

  // Create the Promise, and wrap it around the request.
  return new Promise(function (resolve, reject) {
    var token = bookalope._token;
    if (token === undefined || token === null || token === "" || !isToken(token)) {
      reject(new BookalopeError("Invalid Bookalope token format"));
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open(method, bookalope._host + url);
      xhr.onload = function () {

        // Make sure that this client and the server's API version match; if not, then throw an error.
        if (this.getResponseHeader("X-Bookalope-Api-Version") !== bookalope._version) {
          reject(new BookalopeError("Invalid API server version, please update this client"));
        }

        // Status codes 1xx Informational responses.
        if (this.status < 200) {
          reject(new BookalopeError("Unexpected server response: " + this.statusText + " (" + this.status + ")"));

        // Status codes 2xx Success.
        } else if (this.status < 300) {
          if (this.response instanceof Blob) {
            resolve(this.response);
          } else if (typeof this.response === "string") {
            // TODO Check response Content-Type for JSON.
            resolve(JSON.parse(this.response));
          } else {
            resolve(this.response);
          }

        // Status codes 3xx Redirection.
        } else if (this.status < 400) {
          reject(new BookalopeError("Unexpected server response: " + this.statusText + " (" + this.status + ")"));

        // Status codes 4xx Client errors.
        } else if (this.status < 500) {
          if (typeof this.response === "string") {
            try {
              var json_errors = JSON.parse(this.response);
              if (json_errors.errors !== undefined) {
                var errors = json_errors.errors;
                if (errors.length === 1) {
                  var error = errors[0];
                  if (error.description !== undefined) {
                    reject(new BookalopeError("Client error: " + error.description));
                  }
                } else {
                  // TODO How should we handle multiple errors?
                }
              } else {
                // Unexpected JSON came back from the server.
              }
            } catch (e) {
              // JSON parse failed, so Bookalope responded with HTML. This is a known issue
              // with failed authorization for a request, and needs to be fixed server-side.
              if (this.status === 401) {
                reject(new BookalopeError("Client error: Failed to authenticate, check token"));
              }
            }
          }
          reject(new BookalopeError("Client error: " + this.statusText + " (" + this.status + ")"));

        // Status codes 5xx Server error.
        } else {
          reject(new BookalopeError("Server error: " + this.statusText + " (" + this.status + ")"));
        }
      };
      xhr.onerror = function (ev) {
        reject(new BookalopeError("Unable to conntect to server: " + ev));
      };
      xhr.setRequestHeader("Authorization", "Basic " + btoa(token + ":"));
      xhr.setRequestHeader("Content-type", "application/json");
      // Set additional properties for the xhr instance.
      Object.keys(options).forEach(function(key) {
        xhr[key] = options[key];
      });
      xhr.send(params ? JSON.stringify(params) : null);
    }
  });
};


/**
 * Helper function that performs the actual http GET request, and returns the
 * Promise which wraps the call and response. Fulfills the promise with the
 * returned JSON object; rejects the promise with a BookalopeError.
 *
 * @async
 * @param {string} url - Endpoint to invoke.
 * @param {object} params - Parameters for the call.
 * @param {object} options - Additional properties for the XMLHttpRequest object.
 * @returns {Promise}
 */

BookalopeClient.prototype.httpGET = function(url, params, options) {

  // URL encode parameters if this is a GET method.
  var urlParams = "";
  if (params) {
    var keys = Object.keys(params);
    if (keys.length) {
      urlParams += "?" + keys.map(function(key) { // key => encode...
        return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
      }).join("&");
    }
  }

  return this._httpRequest(url + urlParams, "GET", undefined, options || {});
};


/**
 * Helper function that performs the actual http POST request, and returns the
 * Promise which wraps the call and response. Fulfills the promise with the
 * returned JSON object; rejects the promise with a BookalopeError.
 *
 * @async
 * @param {string} url - Endpoint to invoke.
 * @param {object} params - Parameters for the call.
 * @returns {Promise}
 */

BookalopeClient.prototype.httpPOST = function(url, params) {
  return this._httpRequest(url, "POST", params || {}, {});
};


/**
 * Helper function that performs the actual http DELETE request, and returns the
 * Promise which wraps the call and response. Fulfills the promise with undefined;
 * rejects the promise with a BookalopeError.
 *
 * @async
 * @param {string} url - Endpoint to invoke.
 * @returns {Promise}
 */

BookalopeClient.prototype.httpDELETE = function(url) {
  return this._httpRequest(url, "DELETE", {}, {});
};


/**
 * Set the host name of the Bookalope server that this client should use for all
 * subsequent requests. Defaults to the production host.
 *
 * @param {boolean} betaHost - True if Bookalope's beta host should be used.
 */

BookalopeClient.prototype.setHost = function(betaHost) {
  if (betaHost) {
    this._host = "https://beta.bookalope.net";
  } else {
    this._host = "https://bookflow.bookalope.net";
  }
};


/**
 * Get the host name of the Bookalope server that this client currently uses.
 *
 * @returns {string} The base URL of the server.
 */

BookalopeClient.prototype.getHost = function() {
  return this._host;
};


/**
 * Set the Bookalope API authentication token.
 *
 * @param {string} token - API Token
 * @throws {BookalopeError} If the token has an invalid format.
 */

BookalopeClient.prototype.setToken = function(token) {
  if (token !== undefined && token !== null && token !== "") {
    assert(isToken(token), "Malformed Bookalope token: " + token);
  }
  this._token = token || undefined;
};


/**
 * Get the Bookalope token that's currently used to authenticate requests.
 *
 * @returns {string} Current Bookalope API token.
 */

BookalopeClient.prototype.getToken = function() {
  return this._token;
};


/**
 * Get the user's profile information. Returns a promise that is fulfilled with
 * a Profile instance or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

BookalopeClient.prototype.getProfile = function() {
  var bookalope = this;

  return new Promise(function(resolve, reject) {
    bookalope.httpGET("/api/profile")
    .then(function(response) {

      // Create a new Profile from the response data.
      var profile = new Profile(bookalope);
      profile.firstname = response.user.firstname;
      profile.lastname = response.user.lastname;

      resolve(profile);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Get a list of available Styles for the given file format. Returns a promise that
 * is fulfilled with a list of Style instances or rejected with a BookalopeError.
 *
 * @async
 * @param {string} format - A valid export file format for Bookalope.
 * @returns {Promise}
 */

BookalopeClient.prototype.getStyles = function(format) {
  var bookalope = this;

  return new Promise(function(resolve, reject) {
    var url = "/api/styles";
    var params = {
      "format": format
    };
    bookalope.httpGET(url, params)
    .then(function(response) {

      // Create and populate a list of Style instances from the response data.
      var stylesList = [];
      response.styles.forEach(function(style) {
        stylesList.push(new Style(format, style));
      });

      resolve(stylesList);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Get a list of available Bookalope export file formats. Returns a promise that is
 * fulfilled with a list of Format instances or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

BookalopeClient.prototype.getExportFormats = function() {
  var bookalope = this;

  return new Promise(function(resolve, reject) {
    var url = "/api/formats";
    bookalope.httpGET(url)
    .then(function(response) {

      // Create and populate a list of Format instances from the response data.
      var formatsList = [];
      response.formats.export.forEach(function(format) {
        formatsList.push(new Format(format.mime, format.exts));
      });

      resolve(formatsList);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Get a list of supported Bookalope import file formats. Returns a promise that
 * is fulfilled with a list of Format instances or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

BookalopeClient.prototype.getImportFormats = function() {
  var bookalope = this;

  return new Promise(function(resolve, reject) {
    var url = "/api/formats";
    bookalope.httpGET(url)
    .then(function(response) {

      // Create and populate a list of Format instances from the response data.
      var formatsList = [];
      response.formats.import.forEach(function(format) {
        formatsList.push(new Format(format.name, format.mime, format.exts));
      });

      resolve(formatsList);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Get a list Bookshelves. Returns a promise that is fulfilled with a list of
 * Bookshelf instances or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

BookalopeClient.prototype.getBookshelves = function() {
  var bookalope = this;

  return new Promise(function(resolve, reject) {
    var url = "/api/bookshelves";
    bookalope.httpGET(url)
    .then(function(response) {

      // Create and populate a list of Bookshelf instances from the response data.
      var bookshelfList = [];
      response.bookshelves.forEach(function(bookshelf) {
        bookshelfList.push(new Bookshelf(bookalope, bookshelf));
      });

      resolve(bookshelfList);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Get a list of Books. Returns a promise that is fulfilled with a list of Book
 * instances or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

BookalopeClient.prototype.getBooks = function() {
  var bookalope = this;

  return new Promise(function(resolve, reject) {
    var url = "/api/books";
    bookalope.httpGET(url)
    .then(function(response) {

      // Create and populate a list of Book instances from the response data.
      var bookList = [];
      response.books.forEach(function(book) {
        bookList.push(new Book(bookalope, book));
      });

      resolve(bookList);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Create a new Book on the server. Returns a promise that is fulfilled with a new
 * and valid Book instance or rejected with a BookalopeError.
 *
 * @async
 * @param {string} name - The name for the new book.
 * @param {Bookshelf} bookshelf - A Bookshelf instance to which the new Book belongs.
 * @returns {Promise}
 */

BookalopeClient.prototype.createBook = function(name, bookshelf) {
  var bookalope = this;

  return new Promise(function(resolve, reject) {
    var url = "/api/books";
    var params = {
      "name": name || "<none>"
    };
    if (bookshelf) {
      params["bookshelf_id"] = bookshelf.id;
    }
    bookalope.httpPOST(url, params)
    .then(function(response) {

      // Initialize a Book instance from the response data.
      var book = new Book(bookalope, response.book);

      resolve(book);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * The Profile class implements the Bookalope user profile.
 *
 * @param {BookalopeClient} bookalope - The object of the BookalopeClient
 * @constructor
 */

var Profile = function(bookalope) {
  assert(bookalope instanceof BookalopeClient, "Expected BookalopeClient instance");
  this._bookalope = bookalope;
  this.firstname = undefined;
  this.lastname = undefined;
};


/**
 * Update this Profile instance with data from the Bookalope server. Returns a promise
 * that is fulfilled with the Profile or rejected with a Bookalope error.
 *
 * @async
 * @returns {Promise}
 */

Profile.prototype.update = function() {
  var profile = this;
  var bookalope = profile._bookalope;

  return new Promise(function(resolve, reject) {
    var url = "/api/profile";
    bookalope.httpGET(url)
    .then(function(response) {

      // Update this Profile instance from the response data.
      profile.firstname = response.user.firstname;
      profile.lastname = response.user.lastname;

      resolve(profile);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Save the current Profile instance data to the Bookalope server. Returns a promise that
 * is fulfilled with Profile instance or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Profile.prototype.save = function() {
  var profile = this;
  var bookalope = profile._bookalope;

  return new Promise(function(resolve, reject) {
    var url = "/api/profile";
    var params = {
      "firstname": profile.firstname,
      "lastname": profile.lastname
    };
    bookalope.httpPOST(url, params)
    .then(function(response) {
      resolve(profile);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * A Format instance describes a file format that Bookalope supports either as
 * import or export file format. It contains the mime type of the supported file
 * format, and a list of file name extensions.
 *
 * @param {string} mime - The formats MIME type.
 * @param {array} exts - An array of strings, each of which a valid file name extension.
 * @constructor
 */

var Format = function(name, mime, exts) {
  this.name = name;
  this.mime = mime;
  this.fileExts = exts;
};


/**
 * For every export file format that Bookalope generates, the user can select
 * from several available design styles. This class implements a single such
 * design style.
 *
 * @param {string} format - The file format this style belongs to.
 * @param {object} packed - An object with format information.
 * @constructor
 */

var Style = function(format, packed) {
  this.format = format;
  this.shortName = packed.name;
  this.name = packed.info.name;
  this.description = packed.info.description;
  this.apiPrice = packed.info["price-api"];
};


/**
 * The Bookshelf class describes a single bookshelf as used by Bookalope. A
 * Bookshelf may be associated with zero or more Books, and it has a name.
 *
 * @param {BookalopeClient} bookalope - An instance of the BookalopeClient.
 * @param {string | object} idOrJson - The Book instance is initialized using the
 *        valid ID or the data from a JSON object describing the Book.
 * @throws {BookalopeError} if the idOrJson parameter contained invalid data.
 * @constructor
 */

var Bookshelf = function(bookalope, idOrJson) {
  assert(bookalope instanceof BookalopeClient, "Expected BookalopeClient instance");
  this._bookalope = bookalope;
  if (typeof idOrJson === "object") {
    var bookshelf = idOrJson;
    this.id = book.id;
    this.url = "/api/bookshelves/" + this.id;
    this.name = bookshelf.name;
    this.description = bookshelf.description;
    this.created = new Date(bookshelf.created);
    this.books = [];
    if (bookshelf.books) {
      bookshelf.books.forEach(function(book) {
        this.books.push(new Book(this._bookalope, book));
      }, this);
    }
  } else if (typeof idOrJson === "string") {
    assert(new RegExp("^[0-9a-zA-Z_\-]{32}$").test(idOrJson), "Malformed Bookshelf id: " + idOrJson);
    this.id = idOrJson;
    this.url = "/api/bookhelves/" + this.id;
  } else {
    throw new BookalopeError("Unable to initialize Bookshelf, incorrect parameter");
  }
};


/**
 * Refresh the Bookshelf instance data from the Bookalope server. Returns a promise
 * that is fulfilled with the Bookshelf or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Bookshelf.prototype.update = function() {
  var bookshelf = this;
  var bookalope = bookshelf._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookshelf.url;
    bookalope.httpGET(url)
    .then(function(response) {

      // Update this Bookshelf's properties from the response data. This also
      // re-populates the list of Books.
      bookshelf.name = response.bookshelf.name;
      bookshelf.description = response.bookshelf.description;
      bookshelf.books.length = 0;
      response.bookshelf.books.forEach(function(book) {
        bookshelf.books.push(new Book(bookalope, book));
      });

      resolve(bookshelf);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Post this Bookshelf's instance data to the Bookalope server. Returns a promise
 * that is fulfilled with the Bookshelf or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Bookshelf.prototype.save = function() {
  var bookshelf = this;
  var bookalope = bookshelf._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookshelf.url;
    var params = {
      "description": this.description,
      "name": this.name
    };
    bookalope.httpPOST(url, params)
    .then(function(response) {
      resolve(bookshelf);
    })
    .catch(function(error, message) {
      reject(error);
    });
  });
};


/**
 * Delete this Bookshelf (and all of its Books and their Bookflows) from the Bookalope
 * server. Returns a promise that is fulfilled with the Bookshelf or rejected with a
 * BookalopeError. Note that this Bookshelf instance becomes useless as its ID is invalid.
 *
 * @async
 * @returns {Promise}
 */

Bookshelf.prototype.delete = function() {
  var bookshelf = this;
  var bookalope = bookshelf._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookshelf.url;
    bookalope.httpDELETE(url)
    .then(function(response) {
      resolve(bookshelf);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Add the given Book instance to this Bookshelf. Returns a promise that is fulfilled
 * with the Bookshelf or rejected with a BookalopeError.
 *
 * @async
 * @param {Book} book - A book instance that's added to this Bookshelf.
 * @returns {Promise}
 */

Bookshelf.prototype.addBook = function(book) {
  var bookshelf = this;
  return book.addToBookshelf(bookshelf);
};


/**
 * Remove the given Book instance from this Bookshelf. Returns a promise that is
 * fulfilled with the Bookshelf or rejected with a BookalopeError.
 *
 * @async
 * @param {Book} book - A book instance that's removed from this Bookshelf.
 * @returns {Promise}
 */

Bookshelf.prototype.removeBook = function(book) {
  var bookshelf = this;
  return book.removeFromBookshelf();
};


/**
 * The Book class describes a single book as used by Bookalope. A book has only
 * one name, and a list of conversions: the Bookflows. Note that the Book instance
 * is not necessarily valid with respect to the server data; call .update() to
 * synchronize with the server.
 *
 * @param {BookalopeClient} bookalope - An instance of the BookalopeClient.
 * @param {string | object} idOrJson - The Book instance is initialized using the
 *        valid ID or the data from a JSON object describing the Book.
 * @throws {BookalopeError} if the idOrJson parameter contained invalid data.
 * @constructor
 */

var Book = function(bookalope, idOrJson) {
  assert(bookalope instanceof BookalopeClient, "Expected BookalopeClient instance");
  this._bookalope = bookalope;
  if (typeof idOrJson === "object") {
    var book = idOrJson;
    this.id = book.id;
    this.url = "/api/books/" + this.id;
    this.name = book.name;
    this.created = new Date(book.created);
    this.bookshelf = undefined;
    if (book.bookshelf) {
      this.bookshelf = new Bookshelf(this._bookalope, book.bookshelf.id);
    }
    this.bookflows = [];
    if (book.bookflows) {
      book.bookflows.forEach(function(bookflow) {
        this.bookflows.push(new Bookflow(this._bookalope, this, bookflow));
      }, this);
    }
  } else if (typeof idOrJson === "string") {
    assert(new RegExp("^[0-9a-zA-Z_\-]{32}$").test(idOrJson), "Malformed Book id: " + idOrJson);
    this.id = idOrJson;
    this.url = "/api/books/" + this.id;
  } else {
    throw new BookalopeError("Unable to initialize Book, incorrect parameter");
  }
};


/**
 * Refresh the Book instance data from the Bookalope server. Returns a promise that is
 * fulfilled with the Book or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Book.prototype.update = function() {
  var book = this;
  var bookalope = book._bookalope;

  return new Promise(function(resolve, reject) {
    var url = book.url;
    bookalope.httpGET(url)
    .then(function(response) {

      // Update this Book's properties from the response data. This also re-populates
      // the list of Bookflows.
      book.name = response.book.name;
      book.bookflows.length = 0;
      response.book.bookflows.forEach(function(bookflow) {
        book.bookflows.push(new Bookflow(bookalope, book, bookflow));
      });

      resolve(book);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Post this Book's instance data to the Bookalope server. Returns a promise that is
 * fulfilled with the Book or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Book.prototype.save = function() {
  var book = this;
  var bookalope = book._bookalope;

  return new Promise(function(resolve, reject) {
    var url = book.url;
    var params = {
      "name": this.name
    };
    bookalope.httpPOST(url, params)
    .then(function(response) {
      resolve(book);
    })
    .catch(function(error, message) {
      reject(error);
    });
  });
};


/**
 * Delete this Book from the Bookalope server. Returns a promise that is fulfilled
 * with the Book or rejected with a BookalopeError. Note that this Book instance
 * becomes useless as its ID is invalid.
 *
 * @async
 * @returns {Promise}
 */

Book.prototype.delete = function() {
  var book = this;
  var bookalope = book._bookalope;

  return new Promise(function(resolve, reject) {
    var url = book.url;
    bookalope.httpDELETE(url)
    .then(function(response) {
      resolve(book);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Move this Book onto the specified Bookshelf. If the Book is already associated
 * with a Bookshelf then it moves to the new one. Returns a promise that is
 * fulfilled with the newly created Bookflow or rejected with a BookalopeError.
 *
 * @async
 * @param {Bookshelf} bookshelf - A Bookshelf instance onto which to move this Book.
 * @returns {Promise}
 */

Book.prototype.moveToBookshelf = function(bookshelf) {
  var book = this;
  var bookalope = book._bookalope;

  return new Promise(function(resolve, reject) {
    var url = book.url;
    var params = {
      "bookshelf_id": bookshelf.id
    };
    bookalope.httpPOST(url, params)
    .then(function(response) {
      book.bookshelf = bookshelf;
      resolve(book);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Remove this Book from its Bookshelf. Returns a promise that is fulfilled
 * with the newly created Bookflow or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Book.prototype.removeFromBookshelf = function() {
  var book = this;
  var bookalope = book._bookalope;

  return new Promise(function(resolve, reject) {
    var url = book.url;
    var params = {
      "bookshelf_id": null
    };
    bookalope.httpPOST(url, params)
    .then(function(response) {
      book.bookshelf = undefined;
      resolve(book);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Create a new Bookflow for this Book instance. Returns a promise that is fulfilled
 * with the newly created Bookflow or rejected with a BookalopeError.
 *
 * @async
 * @param {string} name - The name for the new Bookflow, defaults to "Bookflow".
 * @param {string} title - The title for the Bookflow's book, defaults to "<no-title>".
 * @returns {Promise}
 */

Book.prototype.createBookflow = function(name, title) {
  var book = this;
  var bookalope = book._bookalope;

  return new Promise(function(resolve, reject) {
    var url = book.url + "/bookflows";
    var params = {
      "name": name || "Bookflow",
      "title": title || "<no-title>"
    };
    bookalope.httpPOST(url, params)
    .then(function(response) {

      // Create a new Bookflow instance from the response data, and push the new
      // Bookflow onto the end of the Book's Bookflow list.
      var bookflow = new Bookflow(bookalope, book, response.bookflow);
      book.bookflows.push(bookflow);

      resolve(bookflow);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * The Bookflow class describes a Bookalope conversion flow--the bookflow. A
 * bookflow also contains the book's title, author, and other related information.
 * All document uploads, image handling, and conversion is handled by this class.
 *
 * @param {BookalopeClient} bookalope - An instance of the BookalopeClient.
 * @param {Book} book - The Book instance to which this Bookflow belongs.
 * @param {string | object} idOrJson - The Bookflow instance is initialized using
 *        the valid ID or the data from a JSON object describing the Bookflow.
 * @throws {BookalopeError} if the idOrJson parameter contained invalid data.
 * @constructor
 */

var Bookflow = function(bookalope, book, idOrJson) {
  assert(bookalope instanceof BookalopeClient, "Expected BookalopeClient instance");
  this._bookalope = bookalope;

  assert(book instanceof Book, "Expected Book instance");
  this.book = book;

  if (typeof idOrJson === "object") {
    // Trust the JSON: Bookflow really does belong to the Book.
    var bookflow = idOrJson;
    this.id = bookflow.id;
    this.url = "/api/bookflows/" + this.id;
    this.name = bookflow.name;
    this.step = bookflow.step;
    this.credit = undefined;
    if (bookflow.credit) {
      this.credit = bookflow.credit.type;
      // TODO: Does a client want to know formats here as well?
    }
    // Set all of this Bookflow's metatdata to undefined, use .update() later.
    this.title = undefined;
    this.author = undefined;
    this.copyright = undefined;
    this.isbn = undefined;
    this.language = undefined;
    this.pubdate = undefined;
    this.publisher = undefined;
  } else if (typeof idOrJson === "string") {
    assert(new RegExp("^[0-9a-zA-Z_\-]{32}$").test(idOrJson), "Malformed Bookflow id: " + idOrJson);
    this.id = idOrJson;
    this.url = "/api/bookflows/" + this.id;
  } else {
    throw new BookalopeError("Unable to initialize Bookflow, incorrect parameter");
  }
};


/**
 * Refresh the Bookflow instance data from the Bookalope server. Returns a promise
 * that is fulfilled with the Bookflow or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Bookflow.prototype.update = function() {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookflow.url;
    bookalope.httpGET(url)
    .then(function(response) {

      // Update this Bookflow's properties from the response data.
      bookflow.name = response.bookflow.name;
      bookflow.step = response.bookflow.step;
      bookflow.credit = undefined;
      if (response.bookflow.credit) {
        bookflow.credit = response.bookflow.credit.type;
        // TODO: Does a client want to know formats here as well?
      }
      // Copy all of the Bookflow's metatdata as well.
      bookflow.title = response.bookflow.title;
      bookflow.author = response.bookflow.author;
      bookflow.copyright = response.bookflow.copyright;
      bookflow.isbn = response.bookflow.isbn;
      bookflow.language = response.bookflow.language;
      bookflow.pubdate = response.bookflow.pubdate;
      bookflow.publisher = response.bookflow.publisher;

      resolve(bookflow);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Post this Bookflow's instance data to the Bookalope server. Returns a promise that is
 * fulfilled with the Bookflow or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Bookflow.prototype.save = function() {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookflow.url;
    var params = {
      "name": bookflow.name
    };
    // Copy only valid metadata to the parameter array to update on the server.
    var metadata = bookflow.getMetadata();
    Object.keys(metadata).forEach(function(key) {
      var value = metadata[key];
      if (value) {
        params[key] = value;
      }
    });
    bookalope.httpPOST(url, params)
    .then(function(response) {
      resolve(response);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Delete this Bookflow from the Bookalope server. Returns a promise that is fulfilled
 * with the Bookflow or rejected with a BookalopeError. Note that this Bookflow instance
 * becomes useless as its ID is invalid.
 *
 * @async
 * @returns {Promise}
 */

Bookflow.prototype.delete = function() {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    bookalope.httpDELETE(bookflow.url)
    .then(function(response) {
      resolve(bookflow);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Get the Bookflow's web URL. Unlike the API URL, the web URL is the direct link into
 * the web client to work with this Bookflow.
 *
 * @returns {string}
 */

Bookflow.prototype.getWebURL = function() {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return bookalope._host + "/bookflows/" + bookflow.id + "/" + bookflow.step;
};


/**
 * Get Bookflow's metadata. The metadata is all additional data for this particular
 * Bookflow (and thus, the Book).
 *
 * @returns {object}
 */

Bookflow.prototype.getMetadata = function() {
  return {
    "author": this.author,
    "copyright": this.copyright,
    "isbn": this.isbn,
    "language": this.language,
    "pubdate": this.pubdate,
    "publisher": this.publisher,
    "title": this.title
  };
};


/**
 * If an appropriate plan was purchased, then associate a single Bookflow credit
 * from the plan to this Bookflow. Returns a promise that is fulfilled with the
 * the Bookflow, or rejected with a BookalopeError.
 *
 * @async
 * @param {string} credit - The plan type, either "basic" or "pro".
 */

Bookflow.prototype.setCredit = function(credit) {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    if (credit !== "basic" && credit !== "pro") {
      reject(new BookalopeError("Invalid credit type"));
    } else {
      var url = bookflow.url + "/credit";
      var params = {
        type: credit,
      };
      bookalope.httpPOST(url, params)
      .then(function(response) {
        bookflow.credit = credit;
        resolve(bookflow);
      })
      .catch(function(error) {
        reject(error);
      });
    }
  });
};

/**
 * Get the Bookflow's cover image from the Bookalope server. Returns a promise that is
 * fulfilled with the image object or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Bookflow.prototype.getCoverImage = function() {
  return this.getImage("cover-image");
};


/**
 * Get an image of a given name stored with this Bookflow from the Bookalope server.
 * Returns a promise that is fulfilled with the Blob of the image object or rejected
 * with a BookalopeError.
 *
 * @async
 * @param {string} name - Image name.
 * @returns {Promise}
 */

Bookflow.prototype.getImage = function(name) {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookflow.url + "/upload/image";
    var params = {
      "name": name
    };
    var options = {
      "responseType": "blob"
    };
    bookalope.httpGET(url, params, options)
    .then(function(blob) {
      resolve(blob);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Upload the given image file for this Bookflow to the server. Returns a promise that is
 * fulfilled with the Bookflow or rejected with a BookalopeError.
 *
 * @async
 * @param {string} filename - The filename of the image.
 * @param {string} file - A byte array which will be Base64 encoded.
 * @returns {Promise}
 */

Bookflow.prototype.setCoverImage = function(filename, file) {
  return this.addImage("cover-image", filename, file);
};


/**
 * Upload the given image file for this Bookflow to the server. Returns a promise that is
 * fulfilled with the Bookflow or rejected with a BookalopeError.
 *
 * @async
 * @param {string} name - The names used by the Bookalope server to identify this image.
 * @param {string} filename - The filename of the image.
 * @param {string} file - A byte array which will be Base64 encoded.
 * @returns {Promise}
 */

Bookflow.prototype.addImage = function(name, filename, file) {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    if (bookflow.step !== "convert") {
      reject(new BookalopeError("Unable to add image if Bookflow is not in 'convert' step."));
    } else {
      var url = bookflow.url + "/upload/image";
      var params = {
        "file": btoa(file),
        "filename": filename,
        "name": name
      };
      bookalope.httpPOST(url, params)
      .then(function(response) {
        resolve(bookflow);
      })
      .catch(function(error) {
        reject(error);
      });
    }
  });
};


/**
 * Download the original document for this Bookflow from the Bookalope server. Returns
 * a promise that is fulfilled with the Blob of the document or rejected with a BookalopeError.
 *
 * @async
 * @returns {Promise}
 */

Bookflow.prototype.getDocument = function() {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookflow.url + "/upload/document";
    var params = undefined;
    var options = {
      "responseType": "blob"
    };
    bookalope.httpGET(url, params, options)
    .then(function(blob) {
      resolve(blob);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Upload a document for this bookflow. This will start the style analysis,
 * and automatically extract the content and structure of the document using
 * Bookalope's default heuristics. The bookflow's step changes to 'processing'
 * until the analysis has finished (new step value becomes 'convert') or failed
 * (new step value becomes 'processing_failed'). Returns a promise that is
 * fulfilled with the Bookflow or rejected with a BookalopeError.
 *
 * @async
 * @param {string} filename - The filename of the document.
 * @param {string} file - A byte array which will be Base64 encoded.
 * @param {string} filetype - An optional supported file type: "doc", "epub", or "gutenberg".
 * @param {boolean} skip_analysis - Whether Bookalope should skip structure analysis.
 * @param {object} options - Additional options.
 * @returns {Promise}
 */

Bookflow.prototype.setDocument = function(filename, file, filetype, skip_analysis, options) {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    if (bookflow.step !== "upload") {
      reject(new BookalopeError("Unable to set document because one is already set"));
    } else {
      var url = bookflow.url + "/upload/document";
      var params = {
        "file": btoa(file),
        "filename": filename,
        "skip_analysis": skip_analysis || false
      };
      if (filetype && ["doc", "epub", "gutenberg"].includes(filetype)) {
        params["filetype"] = filetype;
      }
      if (options) {
        params["options"] = options;
      }
      bookalope.httpPOST(url, params)
      .then(function(response) {
        bookflow.step = "processing"; // Server does the same.
        resolve(bookflow);
      })
      .catch(function(error) {
        reject(error);
      });
    }
  });
};


/**
 * Initiate the conversion of this bookflow's document. Note that without a proper
 * plan the server converts a test version of the document i.e. it shuffles the letters
 * of random words, thus making the document rather useless for anything but testing
 * purposes. Returns a promise that is fulfilled with the Bookflow or rejected with
 * a BookalopeError.
 *
 * @async
 * @param {string} format - The desired format for the converted and downloaded file.
 * @param {string} style - Name of the visual style for the format.
 * @returns {Promise}
 */

Bookflow.prototype.convert = function(format, style) {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookflow.url + "/convert";
    var params = {
      "format": format,
      "styling": style || "default"
    };
    bookalope.httpPOST(url, params)
    .then(function(response) {
      resolve(bookflow);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Check the current status of the bookflow's conversion for the specified format
 * and style. Returns a promise that is fulfilled with the status string
 * or rejected with a BookalopeError.
 *
 * @async
 * @param {string} format - The desired format for the converted and downloaded file.
 * @returns {Promise}
 */

Bookflow.prototype.convert_status = function(format) {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookflow.url + "/download/" + format + "/status";
    var params = undefined;
    bookalope.httpGET(url, params)
    .then(function(response) {
      resolve(response.status);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};


/**
 * Once the `convert_status()` function returns the status string "available", then download
 * the converted file using this function. Returns a promise that is fulfilled with the
 * downloaded blob or rejected with a BookalopeError.
 *
 * @async
 * @param {string} format - The desired format for the converted and downloaded file.
 * @returns {Promise}
 */

Bookflow.prototype.convert_download = function(format) {
  var bookflow = this;
  var bookalope = bookflow._bookalope;

  return new Promise(function(resolve, reject) {
    var url = bookflow.url + "/download/" + format;
    var params = undefined;
    var options = {
      "responseType": "blob"
    };
    bookalope.httpGET(url, params, options)
    .then(function(blob) {
      resolve(blob);
    })
    .catch(function(error) {
      reject(error);
    });
  });
};
