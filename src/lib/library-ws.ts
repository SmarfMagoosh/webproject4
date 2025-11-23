import { Errors } from 'cs544-js-utils';
import { SuccessEnvelope, PagedEnvelope, ErrorEnvelope } from './response-envelopes.js';
import * as Lib from 'library-types';

import * as Utils from './utils.js';

type NonPagedResult<T> = SuccessEnvelope<T> | ErrorEnvelope;
type PagedResult<T> = PagedEnvelope<T> | ErrorEnvelope;

export function makeLibraryWs(url: string) {
  return new LibraryWs(url);
}

export class LibraryWs {
  //base url for these web services
  private url: string;
  private serverUrl: string;

  constructor(url: string) { 
    this.url = url; 
  }

  /** given an absolute books url bookUrl ending with /books/api,
   *  return a SuccessEnvelope for the book identified by bookUrl.
   */
  async getBookByUrl(bookUrl: URL|string)
    : Promise<Errors.Result<SuccessEnvelope<Lib.XBook>>>
  {
    return getEnvelope<Lib.XBook, SuccessEnvelope<Lib.XBook>>(bookUrl);
  }

  /** given an absolute url findUrl ending with /books with query
   *  parameters search and optional query parameters count and index,
   *  return a PagedEnvelope containing a list of matching books.
   */
  async findBooksByUrl(findUrl: URL|string)
    : Promise<Errors.Result<PagedEnvelope<Lib.XBook>>>
  {
    return getEnvelope<Lib.XBook, PagedEnvelope<Lib.XBook>>(findUrl);
  }

  /** check out book specified by lend */
  //make a PUT request to /lendings
  async checkoutBook(lend: Lib.Lend) : Promise<Errors.Result<void>> {
    const url = new URL(`${this.url}/api/lendings`);
    const options = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lend)
    };
    
    try {
      const response = await fetch(url, options);
      const data = await response.json() as SuccessEnvelope<void> | ErrorEnvelope;
      
      if (!data.isOk) {
        return new Errors.ErrResult((data as ErrorEnvelope).errors as Errors.Err[]);
      } else {
        return Errors.VOID_RESULT;
      }
    }
    catch (err) {
      console.error(err);
      return Errors.errResult(`PUT ${url}: error ${err}`);
    }
  }

  /** return book specified by lend */
  //make a DELETE request to /lendings
  // TODO: possibly last fix
  async returnBook(lend: Lib.Lend) : Promise<Errors.Result<void>> {
    const url = new URL(`${this.url}/api/lendings`);
    const options = {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lend)
    };
    
    try {
      const response = await fetch(url, options);
      const data = await response.json() as SuccessEnvelope<void> | ErrorEnvelope;
      
      if (!data.isOk) {
        return new Errors.ErrResult((data as ErrorEnvelope).errors as Errors.Err[]);
      } else {
        return Errors.VOID_RESULT;
      }
    }
    catch (err) {
      console.error(err);
      return Errors.errResult(`DELETE ${url}: error ${err}`);
    }
  }

  /** return Lend[] of all lendings for isbn. */
  //make a GET request to /lendings with query-params set
  //to { findBy: 'isbn', isbn }.
  async getLends(isbn: string) : Promise<Errors.Result<Lib.Lend[]>> {
    const url = new URL(`${this.url}/api/lendings`);
    url.searchParams.set('findBy', 'isbn');
    url.searchParams.set('isbn', isbn);
    
    try {
      const response = await fetch(url);
      const data = await response.json() as SuccessEnvelope<Lib.Lend[]> | ErrorEnvelope;
      
      if (!data.isOk) {
        return new Errors.ErrResult((data as ErrorEnvelope).errors as Errors.Err[]);
      } else {
        return Errors.okResult((data as SuccessEnvelope<Lib.Lend[]>).result);
      }
    }
    catch (err) {
      console.error(err);
      return Errors.errResult(`GET ${url}: error ${err}`);
    }
  }
}

/** Return either a SuccessEnvelope<T> or PagedEnvelope<T> wrapped 
 *  within a Errors.Result.  Note that the caller needs to instantiate
 *  both type parameters appropriately.
 */
async function getEnvelope<T, T1 extends SuccessEnvelope<T>|PagedEnvelope<T>>
  (url: URL|string)
  : Promise<Errors.Result<T1>>
{
  const result = await fetchJson<T1|ErrorEnvelope>(url);
  if (result.isOk === true) {
    const response = result.val;
    if (response.isOk === true) {
      return Errors.okResult(response as T1);
    }
    else 
      return new Errors.ErrResult((response as ErrorEnvelope).errors as Errors.Err[]);
  }
  else {
    return result as Errors.Result<T1>;
  }
}

const DEFAULT_FETCH = { method: 'GET', };

/** send a request to url, converting any exceptions to an 
 *  error result.
 */
async function
  fetchJson<T>(url: URL|string,  options: RequestInit = DEFAULT_FETCH)
  : Promise<Errors.Result<T>> 
{
  try {
    const response = await fetch(url, options);
    return Errors.okResult(await response.json() as T);
  }
  catch (err) {
    console.error(err);
    return Errors.errResult(`${options.method} ${url}: error ${err}`);
  }
}