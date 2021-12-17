const SORT_ASCENDING = 1;
const SORT_DESCENDING = -1;

class Table {
  // CR: make it clearer that domElement refers to the container (not transposed)
  constructor(domElement, headers, data) {
    this.domElement = domElement;
    this.headers = headers;
    this.sortIndex = null;
    this.sortDirection = SORT_ASCENDING;
    this.update(data);
    this.render();
  }

  update(data) {
    this.data = data;
    this.sort();
  }

  // CR: this isn't friendly to call from the outside...
  sort({ sortIndex = null, sortDirection = SORT_ASCENDING } = {}) {
    if (this.sortIndex === sortIndex && this.sortDirection === sortDirection) {
      // unchanged
      return;
    }

    this.sortIndex = sortIndex;
    this.sortDirection = sortDirection;

    if (!this.sortIndex) {
      // no sort
      return;
    }

    const header = this.headers[this.sortIndex];
    const compareFunction = (a, b) => {
      if (header.sortAscending) {
        return this.sortDirection * header.sortAscending(a, b);
      } else {
        // CR: we can do a little better guessing the types
        // CR: shouldn't we have default sortValue/getValue for array data
        let av = header.sortValue ? header.sortValue(a) : header.getValue(a);
        let bv = header.sortValue ? header.sortValue(b) : header.getValue(b);
        return this.sortDirection * ((av > bv) - (av < bv));
      }
    };

    this.data.sort(compareFunction);
  }

  render() {
    let domTable = document.createElement('table');
    let domThead = document.createElement('thead');
    let domTheadTr = document.createElement('tr');
    let domTbody = document.createElement('tbody');

    domTable.appendChild(domThead);
    domTable.appendChild(domTbody);
    domThead.appendChild(domTheadTr);

    for (let i in this.headers) {
      let header = this.headers[i];
      let th = document.createElement('th');
      if (header.class) {
        th.setAttribute('class', header.class);
      }
      th.setAttribute('header-index', i);
      th.innerHTML = header.label;
      domTheadTr.appendChild(th);
    }

    for (let value of this.data) {
      let tr = document.createElement('tr');
      domTbody.appendChild(tr);

      for (let header of this.headers) {
        let td = document.createElement('td');
        tr.appendChild(td);

        if (header.class) {
          td.setAttribute('class', header.class);
        }
        td.innerHTML = header.getValue(value);
      }
    }

    this.domElement.innerHTML = '';
    this.domElement.appendChild(domTable);

    domTable.addEventListener('click', event => {
      if (event.target.tagName == 'TH') {
        let sortIndex = parseInt(event.target.getAttribute('header-index'));
        let sortDirection =
          this.sortIndex === sortIndex ? -this.sortDirection : SORT_ASCENDING;

        this.sort({ sortIndex: sortIndex, sortDirection: sortDirection });
        this.render();
      }
    });
  }
}

module.exports = Table;
