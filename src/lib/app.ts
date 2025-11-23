import { Errors } from 'cs544-js-utils';
import * as Lib from 'library-types';
import { NavLinks, LinkedResult, PagedEnvelope, SuccessEnvelope }
  from './response-envelopes.js';
import { makeLibraryWs, LibraryWs } from './library-ws.js';
import { makeElement, makeQueryUrl, getFormData } from './utils.js';

export default function makeApp(wsUrl: string) {
  return new App(wsUrl);
}

class App {
  private readonly wsUrl: string;
  private readonly ws: LibraryWs;
  private readonly result: HTMLElement;
  private readonly errors: HTMLElement;

  constructor(wsUrl: string) {
    this.wsUrl = wsUrl;
    this.ws = makeLibraryWs(wsUrl);
    this.result = document.querySelector('#result')!;
    this.errors = document.querySelector('#errors')!;
    
    // Add search handler
    const searchInput = document.querySelector('#search') as HTMLInputElement;
    searchInput.addEventListener('blur', async (ev) => {
      this.clearErrors();
      ev.preventDefault();
      const searchTerm = searchInput.value.trim();
      if (searchTerm.length === 0) return;
      
      // Validate search terms
      if (searchTerm.split(/\s+/).some(word => word.length < 2)) {
        this.displayErrors([Errors.errResult(
          'search string must specify words having two or more characters',
          { widget: 'search' }
        ).errors[0]]);
        return;
      }
      
      const url = makeQueryUrl(`${this.wsUrl}/api/books`, { search: searchTerm });
      await this.displaySearchResults(url);
      console.log(this.wsUrl, url);
    });
  }
  
  private async displaySearchResults(url: URL | string) {
    this.clearResult();
    const result = await this.ws.findBooksByUrl(url);
    const envelope = this.unwrap(result);
    if (!envelope) return;
    
    const books = envelope.result;
    
    // Create scroll controls
    const topScroll = this.createScrollControls(envelope.links);
    if (topScroll) this.result.append(topScroll);
    
    // Create results list
    const resultsList = makeElement('ul', { id: 'search-results' });
    for (const bookResult of books) {
      const book = bookResult.result;
      const li = makeElement('li', {},
        makeElement('span', { class: 'content' }, book.title!),
        makeElement('a', { class: 'details' }, 'details...')
      );
      
      const detailsLink = li.querySelector('.details') as HTMLElement;
      detailsLink.addEventListener('click', async (ev) => {
        ev.preventDefault();
        this.clearErrors();
        await this.displayBookDetails(bookResult.links.self.href);
      });
      
      resultsList.append(li);
    }
    
    this.result.append(resultsList);
    
    const bottomScroll = this.createScrollControls(envelope.links);
    if (bottomScroll) this.result.append(bottomScroll);
  }
  
  private createScrollControls(links: NavLinks): HTMLElement | null {
    if (!links.prev && !links.next) return null;
    
    const scrollDiv = makeElement('div', { class: 'scroll' });
    console.log(links);
    if (links.prev) {
      const prevLink = makeElement('a', { rel: 'prev' }, '<<');
      prevLink.addEventListener('click', async (ev) => {
        ev.preventDefault();
        this.clearErrors();
        await this.displaySearchResults(`${this.wsUrl}${links.prev!.href}`);
      });
      scrollDiv.append(prevLink);
    }
    if (links.next) {
      const nextLink = makeElement('a', { rel: 'next' }, '>>');
      nextLink.addEventListener('click', async (ev) => {
        ev.preventDefault();
        this.clearErrors();
        await this.displaySearchResults(`${this.wsUrl}${links.next!.href}`);
      });
      scrollDiv.append(nextLink);
    }
    return scrollDiv;
  }
  
  private async displayBookDetails(bookUrl: string) {
    this.clearResult();
    const result = await this.ws.getBookByUrl(`${this.wsUrl}${bookUrl}`);
    const envelope = this.unwrap(result);
    if (!envelope) return;
    
    const book = envelope.result;
    
    const dl = makeElement('dl', { class: 'book-details' },
      makeElement('dt', {}, 'ISBN'), makeElement('dd', {}, book.isbn!),
      makeElement('dt', {}, 'Title'), makeElement('dd', {}, book.title!),
      makeElement('dt', {}, 'Authors'), makeElement('dd', {}, book.authors?.join('; ') || 'None'),
      makeElement('dt', {}, 'Number of Pages'), makeElement('dd', {}, book.pages?.toString() || '0'),
      makeElement('dt', {}, 'Publisher'), makeElement('dd', {}, book.publisher || 'Unknown'),
      makeElement('dt', {}, 'Number of Copies'), makeElement('dd', {}, book.nCopies?.toString() || '0'),
      makeElement('dt', {}, 'Borrowers'), makeElement('dd', { id: 'borrowers' }, 'Loading...')
    );
    
    this.result.append(dl);
    
    // Add checkout form - create as HTMLFormElement
    const form = document.createElement('form');
    form.className = 'grid-form';
    form.append(
      makeElement('label', { for: 'patronId' }, 'Patron ID'),
      makeElement('span', {},
        makeElement('input', { id: 'patronId' }), makeElement('br', {}),
        makeElement('span', { class: 'error', id: 'patronId-error' })
      ),
      makeElement('button', { type: 'submit' }, 'Checkout Book')
    );
    
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      this.clearErrors();
      const formData = getFormData(form);
      const patronId = (document.getElementById("patronId") as HTMLInputElement).value;
      
      if (!patronId) {
        this.displayErrors([Errors.errResult(
          'Patron ID must be non-empty', 
          { widget: 'patronId' }
        ).errors[0]]);
        return;
      }
      
      const lend: Lib.Lend = { isbn: book.isbn!, patronId };
      const checkoutResult = await this.ws.checkoutBook(lend);
      
      // Check if the result has errors using isOk property
      if (!checkoutResult.isOk) {
        this.displayErrors((checkoutResult as Errors.ErrResult).errors);
      } else {
        (form.querySelector('#patronId') as HTMLInputElement).value = '';
        await this.displayBorrowers(book.isbn!);
      }
    });
    
    this.result.append(form);
    await this.displayBorrowers(book.isbn!);
  }
  
  private async displayBorrowers(isbn: string) {
    const borrowersElement = document.querySelector('#borrowers') as HTMLElement;
    if (!borrowersElement) return;
    
    const result = await this.ws.getLends(isbn);
    const lends = this.unwrap(result);
    if (!lends) {
      borrowersElement.innerHTML = 'None';
      return;
    }
    
    if (lends.length === 0) {
      borrowersElement.innerHTML = 'None';
      return;
    }
    
    const ul = makeElement('ul', {});
    for (const lend of lends) {
      const li = makeElement('li', {},
        makeElement('span', { class: 'content' }, lend.patronId!),
        makeElement('button', { class: 'return-book' }, 'Return Book')
      );
      
      const returnButton = li.querySelector('.return-book') as HTMLElement;
      returnButton.addEventListener('click', async (ev) => {
        ev.preventDefault();
        this.clearErrors();
        console.log(lend);
        const returnResult = await this.ws.returnBook(lend);
        
        // Check if the result has errors using isOk property
        if (!returnResult.isOk) {
          this.displayErrors((returnResult as Errors.ErrResult).errors);
        } else {
          await this.displayBorrowers(isbn);
        }
      });
      
      ul.append(li);
    }
    
    borrowersElement.innerHTML = '';
    borrowersElement.append(ul);
  }
  
  private clearResult() {
    this.result.innerHTML = '';
  }

  private unwrap<T>(result: Errors.Result<T>): T | undefined {
    if (result.isOk === false) {
      // FIXED: Use the result directly instead of accessing .errors
      this.displayErrors((result as Errors.ErrResult).errors);
      return undefined;
    }
    else {
      return result.val;
    }
  }

  private clearErrors() {
    this.errors.innerHTML = '';
    document.querySelectorAll('.error').forEach( el => {
      el.innerHTML = '';
    });
  }
  
  private displayErrors(errors: Errors.Err[]) {
    displayErrors(errors);
  }
}

function displayErrors(errors: Errors.Err[]) {
  const errorsElement = document.querySelector('#errors') as HTMLElement;
  for (const err of errors) {
    const id = err.options?.widget ?? err.options?.path;
    const widget = id && document.querySelector(`#${id}-error`);
    if (widget) {
      widget.append(err.message);
    }
    else {
      const li = makeElement('li', {class: 'error'}, err.message);
      errorsElement.append(li);
    }
  }
}