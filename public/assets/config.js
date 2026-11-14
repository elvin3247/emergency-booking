// Shared by the pages (window.SITE) and the server functions (require).
// Change the brand name here and it updates the whole site and every email.
(function (root) {
  var brand = 'YourBrand';
  var C = {
    brand: brand,
    siteUrl: '',        // your live address, e.g. 'https://example.com'. Needed for the sitemap and share previews. Run `npm run build` after changing.
    // Your business mailing address. The law (CAN-SPAM) requires it in recruiting emails to companies that haven't signed up yet,
    // so bulk invites stay off until it's filled in. A PO box or registered agent address is fine.
    mailingAddress: '',
    analytics: 'vercel', // page-view counts via Vercel Web Analytics (turn it on in the Vercel dashboard). Set to '' to remove.
    // Free launch: no lead fees for anyone while we build up the network. Set to false to start charging
    // leadFee per chosen lead (after each pro's freeLeads). Give pros 30 days' notice by email first, as the terms promise.
    freeLaunch: true,
    leadFee: 50,        // dollars per chosen lead, once freeLaunch is off
    freeLeads: 3,       // first chosen leads are free
    maxOffers: 3,       // contractors a customer can choose between
    windowMin: 15,      // minutes before we say no one has confirmed
    openHours: 12,      // hours a request keeps accepting offers
    widenMin: 10,       // no yes after this many minutes: remind the pros we alerted and add pros from neighboring counties
    confirmMin: 10,     // the chosen pro should confirm within this many minutes, or the homeowner is offered another pro
    standbyMin: 30,     // after a match, the other pros who said yes stay on standby this long
    keepPhotosDays: 90, // photos are deleted after this many days
    // Counties that share a border, for widening a search.
    neighbors: {
      Atlantic: ['Burlington', 'Camden', 'Gloucester', 'Cumberland', 'Cape May', 'Ocean'], Bergen: ['Passaic', 'Hudson', 'Essex'],
      Burlington: ['Mercer', 'Monmouth', 'Ocean', 'Atlantic', 'Camden'], Camden: ['Burlington', 'Gloucester', 'Atlantic'],
      'Cape May': ['Atlantic', 'Cumberland'], Cumberland: ['Salem', 'Gloucester', 'Atlantic', 'Cape May'],
      Essex: ['Passaic', 'Bergen', 'Hudson', 'Union', 'Morris'], Gloucester: ['Camden', 'Salem', 'Cumberland', 'Atlantic'],
      Hudson: ['Bergen', 'Essex', 'Union'], Hunterdon: ['Warren', 'Morris', 'Somerset', 'Mercer'],
      Mercer: ['Hunterdon', 'Somerset', 'Middlesex', 'Monmouth', 'Burlington'], Middlesex: ['Somerset', 'Union', 'Monmouth', 'Mercer'],
      Monmouth: ['Middlesex', 'Mercer', 'Burlington', 'Ocean'], Morris: ['Sussex', 'Passaic', 'Essex', 'Union', 'Somerset', 'Hunterdon', 'Warren'],
      Ocean: ['Monmouth', 'Burlington', 'Atlantic'], Passaic: ['Sussex', 'Morris', 'Essex', 'Bergen'], Salem: ['Gloucester', 'Cumberland'],
      Somerset: ['Hunterdon', 'Morris', 'Union', 'Middlesex', 'Mercer'], Sussex: ['Warren', 'Morris', 'Passaic'],
      Union: ['Essex', 'Morris', 'Somerset', 'Middlesex', 'Hudson'], Warren: ['Sussex', 'Morris', 'Hunterdon']
    },
    maxPhotos: 3,       // photos a homeowner can add to a request
    minReviews: 3,      // a pro's star rating shows to homeowners once they have this many reviews
    limits: { perContactHour: 3, perDeviceHour: 6 }, // most requests one email, phone, or internet connection can send in an hour
    counties: ['Atlantic', 'Bergen', 'Burlington', 'Camden', 'Cape May', 'Cumberland', 'Essex', 'Gloucester', 'Hudson', 'Hunterdon', 'Mercer', 'Middlesex', 'Monmouth', 'Morris', 'Ocean', 'Passaic', 'Salem', 'Somerset', 'Sussex', 'Union', 'Warren'],
    // The kinds of company we sign up. Each has its own New Jersey license, which you check before approving.
    trades: {
      hvac: { name: 'Heating and cooling', pro: 'HVAC contractor', pros: 'HVAC contractors', license: 'NJ HVACR license', slug: 'hvac', seo: 'HVAC repair' },
      plumbing: { name: 'Plumbing', pro: 'plumber', pros: 'plumbers', license: 'NJ master plumber license', slug: 'plumbing', seo: 'plumber' },
      electrical: { name: 'Electrical', pro: 'electrician', pros: 'electricians', license: 'NJ electrical contractor license', slug: 'electrical', seo: 'electrician' },
      appliance: { name: 'Appliance repair', pro: 'appliance repair pro', pros: 'appliance repair pros', license: 'NJ license or registration', slug: 'appliance-repair', seo: 'appliance repair' }
    },
    // What homeowners pick from. `live: false` shows the service as "Soon": homeowners can't request it yet,
    // but contractors in that trade can already apply. Flip to true once you have pros signed up, then run `npm run build`.
    services: {
      'heating': { name: 'Heating', trade: 'hvac', live: true, blurb: 'No heat, furnace, boiler, heat pump' },
      'cooling': { name: 'Cooling', trade: 'hvac', live: true, blurb: 'No AC, warm air, frozen or leaking unit' },
      'plumbing': { name: 'Plumbing', trade: 'plumbing', live: true, blurb: 'Burst pipe, clog, toilet, sump pump' },
      'water-heater': { name: 'Water heater', trade: 'plumbing', live: true, blurb: 'No hot water, leaking tank' },
      'electrical': { name: 'Electrical', trade: 'electrical', live: false, blurb: 'Partial power loss, breaker, outlet' },
      'appliances': { name: 'Appliances', trade: 'appliance', live: false, blurb: 'Fridge, washer, dryer, oven' }
    },
    // Line icons for each service (drawn inside a 24 by 24 box).
    icons: {
      'heating': '<path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z"/>',
      'cooling': '<path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1L19.1 4.9"/>',
      'plumbing': '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
      'water-heater': '<rect x="7" y="3" width="10" height="18" rx="3"/><path d="M10 9h4M12 14v3"/>',
      'electrical': '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
      'appliances': '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="13" r="4"/>'
    },
    // key: [label, short description, services it belongs to]
    problems: {
      'no-heat': ['No heat', 'Furnace, boiler, or heat pump not heating', ['heating']],
      'no-cooling': ['No cooling', 'AC or heat pump not cooling', ['cooling']],
      'leak': ['Water leaking from unit', 'Water around the furnace or air handler', ['heating', 'cooling']],
      'noise': ['Loud noise or burning smell', 'Banging, grinding, or an electrical smell', ['heating', 'cooling']],
      'thermostat': ['Thermostat not working', 'Blank screen or system will not respond', ['heating', 'cooling']],
      'burst-pipe': ['Burst or leaking pipe', 'Water spraying, dripping, or a wet ceiling or wall', ['plumbing']],
      'clog': ['Clogged drain or backup', 'Sink, tub, toilet, or sewer line backing up', ['plumbing']],
      'toilet': ['Toilet problem', 'Overflowing, running nonstop, or will not flush', ['plumbing']],
      'sump': ['Sump pump not working', 'Water rising in the pit or basement', ['plumbing']],
      'no-hot-water': ['No hot water', 'Water heater not heating or running out fast', ['water-heater']],
      'wh-leak': ['Water heater leaking', 'Water under or around the tank', ['water-heater']],
      'power-out': ['Power out in part of the house', 'Some rooms or outlets dead while neighbors have power', ['electrical']],
      'breaker': ['Breaker keeps tripping', 'Trips again right after you reset it', ['electrical']],
      'outlet': ['Outlet or switch problem', 'Dead, warm to the touch, buzzing, or scorched', ['electrical']],
      'fridge': ['Refrigerator not cooling', 'Fridge or freezer warm, leaking, or loud', ['appliances']],
      'laundry': ['Washer or dryer not working', 'Will not start, drain, spin, or heat', ['appliances']],
      'kitchen': ['Oven, stove, or dishwasher', 'Will not heat, light, or run', ['appliances']],
      'other': ['Something else', 'Describe it in the next step', ['heating', 'cooling', 'plumbing', 'water-heater', 'electrical', 'appliances']]
    },
    timings: ['As soon as possible', 'Later today', 'Tomorrow'],
    // Asked only on heating and cooling requests.
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
      contractor: 'I agree to get job alerts from ' + brand + ' by email, to the lead terms on this page, and to my company name, trade, license number, and business phone being shown on the site.',
      // Text alerts are a separate, optional opt-in. Carriers check this wording when you register for business texting.
      sms: 'Text me job alerts from ' + brand + ' at this mobile number. Message frequency varies with requests in my area (often a few a day). Message and data rates may apply. Reply STOP to stop, HELP for help. Agreeing is not required to join.'
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.SITE = C;
})(this);
