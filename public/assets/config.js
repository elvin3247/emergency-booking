// Shared by the pages (window.SITE) and the server functions (require).
// Change the brand name here and it updates the whole site and every email.
(function (root) {
  var brand = 'YourBrand';
  var C = {
    brand: brand,
    leadFee: 50,        // dollars per chosen lead
    freeLeads: 3,       // first chosen leads are free
    maxOffers: 3,       // contractors a customer can choose between
    windowMin: 15,      // minutes before we say no one has confirmed
    openHours: 12,      // hours a request keeps accepting offers
    counties: ['Atlantic', 'Bergen', 'Burlington', 'Camden', 'Cape May', 'Cumberland', 'Essex', 'Gloucester', 'Hudson', 'Hunterdon', 'Mercer', 'Middlesex', 'Monmouth', 'Morris', 'Ocean', 'Passaic', 'Salem', 'Somerset', 'Sussex', 'Union', 'Warren'],
    problems: {
      'no-heat': ['No heat', 'Furnace, boiler, or heat pump not heating'],
      'no-cooling': ['No cooling', 'AC or heat pump not cooling'],
      'leak': ['Water leaking from unit', 'Water around the furnace or air handler'],
      'noise': ['Loud noise or burning smell', 'Banging, grinding, or an electrical smell'],
      'thermostat': ['Thermostat not working', 'Blank screen or system will not respond'],
      'other': ['Something else', 'Describe it in the next step']
    },
    timings: ['As soon as possible', 'Later today', 'Tomorrow'],
    systems: ['Not sure', 'Gas furnace', 'Boiler', 'Heat pump', 'Central AC', 'Ductless mini split'],
    arrivals: ['Within 1 hour', '1 to 2 hours', '2 to 4 hours', 'Later today', 'Tonight', 'Tomorrow morning'],
    alertHours: {
      any: 'Any time, 24/7',
      day: '7am to 10pm, every day',
      weekday: 'Weekdays, 7am to 6pm',
      nights: 'Nights and weekends only'
    },
    // Have a lawyer review both of these before launch.
    consent: {
      homeowner: 'I agree to get emails and texts from ' + brand + ' about this request, and a call, text, or email from the one contractor I choose.',
      contractor: 'I agree to get job alerts from ' + brand + ' by email and text at the contacts above, to the lead terms on this page, and to my business phone being shown to customers.'
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.SITE = C;
})(this);
