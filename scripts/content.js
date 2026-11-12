// Troubleshooting guides shown at /help/<key>. Plain homeowner checks only: nothing that needs tools or opening equipment.
// A guide only gets a page while its service is switched on in config.js. `danger` replaces the gas warning at the top.
// Edit the wording here, then run `npm run build`.
module.exports = {
  'no-heat': {
    title: 'No heat? 7 things to check before you call',
    h1: 'No heat? Check these first',
    desc: 'Furnace, boiler, or heat pump not heating? Seven safe checks you can do in ten minutes, when to stop, and how to get a licensed New Jersey contractor out fast.',
    intro: 'Plenty of no-heat calls end with a dead thermostat battery or a switch someone bumped. These checks take about ten minutes and need no tools.',
    checks: [
      ['Check the thermostat', 'Set it to Heat and a few degrees above the room temperature. If the screen is blank or dim, replace the batteries.'],
      ['Find the furnace switch', 'Most furnaces and boilers have a power switch on or near the unit that looks like a light switch. Make sure it is on.'],
      ['Check the breaker', 'Look for a tripped breaker labeled furnace, boiler, or heat. Reset it once. If it trips again, leave it off and call a contractor.'],
      ['Look at the filter', 'A clogged filter can make a furnace overheat and shut itself off. If the filter is gray and packed with dust, replace it.'],
      ['Clear the vents', 'Make sure room vents are open and not blocked. If white plastic pipes run from your furnace to the outside, check that snow, ice, or leaves are not blocking them.'],
      ['Check your fuel', 'On oil or propane, check the tank gauge. An empty tank is a call to your fuel company, not an HVAC contractor.'],
      ['Heat pump in a cold snap', 'Light frost on the outdoor unit is normal and clears on its own. If the unit is cased in ice or not running at all, it needs service.']
    ],
    stop: ['You smell gas or a carbon monoxide alarm sounds. Leave the house and call 911 or your gas utility from outside.', 'The breaker trips a second time.', 'You see water around the unit, scorch marks, or smell burning.', 'The furnace starts, then shuts off again within a few minutes.'],
    meanwhile: ['Never heat your home with an oven, stove, or grill.', 'Keep space heaters three feet from anything that can burn, and turn them off when you leave the room or sleep.', 'In freezing weather, open cabinet doors under sinks and let faucets drip to protect pipes.']
  },
  'no-cooling': {
    title: 'AC not cooling? 6 things to check before you call',
    h1: 'No cooling? Check these first',
    desc: 'AC or heat pump running but not cooling, or not running at all? Six safe checks, when to shut it off, and how to get a licensed New Jersey contractor out fast.',
    intro: 'Before you pay for a visit, rule out the simple causes. These checks take about ten minutes and need no tools.',
    checks: [
      ['Check the thermostat', 'Set it to Cool and a few degrees below the room temperature. If the screen is blank or dim, replace the batteries.'],
      ['Check both breakers', 'Central air usually has two: one for the indoor unit and one for the outdoor unit. Reset a tripped breaker once. If it trips again, leave it off.'],
      ['Look at the filter', 'A clogged filter chokes airflow and can freeze the system. If it is gray and packed with dust, replace it.'],
      ['Look at the outdoor unit', 'Clear leaves, grass clippings, and anything stacked against it. Check whether the fan on top is spinning when the system is on.'],
      ['Look for ice', 'Ice on the copper lines or the indoor unit means stop. Turn cooling off, set the fan to On so it thaws, and call a contractor. Running it frozen can damage it.'],
      ['Check for water', 'A full drain pan can trip a safety switch that shuts the system down. Water near the indoor unit points to a clogged drain line.']
    ],
    stop: ['The breaker trips a second time.', 'You see ice on the lines or the indoor unit.', 'You smell burning or hear grinding, screeching, or loud banging.', 'The outdoor unit hums but the fan does not spin.'],
    meanwhile: ['Close blinds and curtains on sunny windows and run fans.', 'Check on older relatives, young children, and pets. They overheat fastest.', 'Confusion, fainting, or hot dry skin in the heat is an emergency. Call 911.']
  },
  'leak': {
    title: 'Water leaking from your furnace or AC? What to do first',
    h1: 'Water around the unit? Do this first',
    desc: 'Water pooling around a furnace, air handler, or boiler: how to stop the damage, the most common cause, and when you need a licensed contractor.',
    intro: 'Most water around a furnace or air handler is condensation that cannot drain. It is rarely dangerous, but it can ruin floors and ceilings quickly.',
    checks: [
      ['Turn the system off', 'Switch the thermostat to Off so the unit stops making more water.'],
      ['Stay safe around the water', 'If water is touching wiring or the unit itself, turn off its breaker before you go near it. Do not stand in water while touching the equipment.'],
      ['Soak it up', 'Towels or a wet vacuum now will save the floor. If the unit is in the attic, check the ceiling below for stains.'],
      ['Look at the filter', 'A clogged filter can freeze the coil. When that ice melts, it overflows the drain pan. Replace a dirty filter.'],
      ['Find the drain line', 'A plastic pipe carries water from the indoor unit to a drain or outdoors. If it is clogged with slime, water backs up. A contractor can clear it quickly.'],
      ['Note what kind of system it is', 'Water under a boiler or water heater is a different problem from AC condensation. Tell the contractor which you have.']
    ],
    stop: ['Water is coming from a boiler or its pipes.', 'Water is near wiring or the electrical panel.', 'The leak returns after you dry it and restart the system.', 'You see a stain spreading on a ceiling.'],
    meanwhile: ['Leave the system off until someone has looked at it.', 'Move rugs, boxes, and furniture away from the water.', 'Take a few photos. They help the contractor and any insurance claim.']
  },
  'noise': {
    title: 'Furnace or AC making loud noise or a burning smell? What it means',
    h1: 'Loud noise or burning smell? Read this first',
    desc: 'Banging, grinding, screeching, or a burning smell from your heating or cooling system: what is normal, what is not, and when to shut it off and call.',
    intro: 'Some sounds and smells are harmless. Others mean shut it off now. Here is how to tell them apart.',
    checks: [
      ['Dusty smell at first start', 'A light burning-dust smell the first time the heat runs each fall is common and should fade within an hour or so.'],
      ['Electrical or plastic smell', 'Turn the system off at the thermostat and its breaker. This can be an overheating motor or wiring, and it needs a contractor.'],
      ['Rotten egg smell', 'That is the warning odor added to natural gas. Leave the house and call 911 or your gas utility from outside.'],
      ['Grinding or screeching', 'Usually a failing motor or bearing. Turn the system off so it does not do more damage.'],
      ['Loud bang at start-up', 'A single boom when a furnace lights can mean delayed ignition. Turn it off and have it checked before running it again.'],
      ['Rattling', 'Often a loose panel or a stick in the outdoor unit. With the power off, check that panels are snug and nothing is caught in the fan.']
    ],
    stop: ['You see smoke or flames. Get out and call 911.', 'You smell gas or a carbon monoxide alarm sounds.', 'A burning smell does not fade, or comes back.', 'Grinding, screeching, or banging happens every time it runs.'],
    meanwhile: ['Leave the system off.', 'If you turned off a breaker, leave it off until a contractor says otherwise.', 'Note when the noise or smell happens: at start-up, while running, or at shut-off.']
  },
  'thermostat': {
    title: 'Thermostat blank or not working? 6 quick fixes',
    h1: 'Thermostat not working? Check these first',
    desc: 'Blank thermostat screen, or heating and cooling that ignore it? Six quick fixes to try before you call a New Jersey HVAC contractor.',
    intro: 'A blank or unresponsive thermostat is often a power problem somewhere else in the system. These checks take a few minutes.',
    checks: [
      ['Replace the batteries', 'Many thermostats run on AA or AAA batteries behind the faceplate. Swap them even if the screen still shows faintly.'],
      ['Check the breaker and furnace switch', 'Most thermostats get power from the furnace or air handler. A tripped breaker or a switched-off unit leaves the screen blank.'],
      ['Close the furnace door', 'A safety switch cuts power when the furnace panel is loose. Make sure the door is fully seated.'],
      ['Check the mode and schedule', 'Make sure it is set to Heat or Cool, not Off, and that a schedule or vacation hold is not overriding you.'],
      ['Check for water in summer', 'A full AC drain pan can trip a safety switch that also cuts power to the thermostat.'],
      ['Restart a smart thermostat', 'Use its restart option in the menu, or pull it off the wall plate for a minute and put it back.']
    ],
    stop: ['The screen stays blank after new batteries and a breaker check.', 'The thermostat clicks but nothing starts.', 'The breaker trips again after you reset it.', 'The system runs constantly and ignores the setting.'],
    meanwhile: ['Write down the thermostat brand and model for the contractor.', 'If the system is stuck on, you can turn it off at its breaker.', 'In freezing weather, protect pipes by opening cabinet doors and letting faucets drip.']
  },
  'burst-pipe': {
    title: 'Burst or leaking pipe? What to do in the first 5 minutes',
    h1: 'Burst or leaking pipe? Do this first',
    desc: 'Water spraying or dripping from a pipe, ceiling, or wall: how to shut the water off, limit the damage, and get a licensed New Jersey plumber out fast.',
    intro: 'The first few minutes matter most. Stopping the water comes before anything else, and you can do it without tools.',
    danger: 'Water near outlets, the electrical panel, or a sagging ceiling?',
    checks: [
      ['Shut off the main water valve', 'It is usually where the water line enters the house: in the basement, a crawl space, or a utility closet, often near the water meter. Turn a round handle clockwise until it stops, or turn a lever a quarter turn so it sits across the pipe.'],
      ['Open a faucet', 'Run cold water at the lowest faucet in the house to drain what is left in the pipes and take the pressure off the leak.'],
      ['Keep water away from electricity', 'If water is near outlets, appliances, or the panel, turn off the breakers for that area, but only if you can reach the panel without standing in water.'],
      ['Catch and soak it up', 'Put a bucket under the drip and use towels or a wet vacuum on the floor. Move rugs, boxes, and furniture out of the way.'],
      ['Watch the ceiling', 'A bulging ceiling is holding water and can come down. Keep people out from under it and tell the plumber.'],
      ['Find the spot if you can', 'Note where the water is coming from and whether it stopped once the main was off. That tells the plumber a lot before they arrive.']
    ],
    stop: ['Water keeps flowing with the main valve off.', 'You cannot find or turn the main valve.', 'Water reached outlets, wiring, or the electrical panel.', 'A ceiling is sagging or dripping in more than one place.'],
    meanwhile: ['Leave the main water off until the pipe is repaired.', 'Take photos of the damage for any insurance claim.', 'In freezing weather, keep the heat on so other pipes do not freeze.']
  },
  'clog': {
    title: 'Clogged drain or sewer backup? 5 things to check first',
    h1: 'Clogged drain or backup? Check these first',
    desc: 'Sink, tub, or toilet backing up? Five safe checks that tell you whether it is one drain or the main line, and when to call a licensed New Jersey plumber.',
    intro: 'One slow drain is usually a small job. Water coming up in several places at once means the main line, and that needs a plumber.',
    danger: 'Sewage backing up near outlets or appliances?',
    checks: [
      ['Stop running water', 'Do not flush, run the dishwasher, or start the washer until you know where the clog is. More water has nowhere to go.'],
      ['See how many drains are affected', 'One sink or one toilet points to a local clog. A toilet that bubbles when the sink drains, or water coming up in a tub or floor drain, points to the main line.'],
      ['Try a plunger', 'For a single toilet or sink, a plunger with a good seal and a dozen firm strokes clears many clogs. Use a flange plunger for toilets.'],
      ['Skip the chemical cleaner', 'Drain chemicals often fail on a full clog and leave caustic water sitting in the pipe, which is a hazard for you and the plumber.'],
      ['Check the lowest drain', 'Look at the basement floor drain or lowest shower. Water or sewage there confirms a main line backup.']
    ],
    stop: ['Sewage is coming up through a floor drain, tub, or shower.', 'More than one fixture is backing up.', 'Plunging does nothing, or the clog returns within a day.', 'You already poured in drain chemicals. Tell the plumber so they can protect themselves.'],
    meanwhile: ['Keep children and pets away from any sewage.', 'Do not run water anywhere in the house during a main line backup.', 'Wear gloves for cleanup and wash your hands well afterward.']
  },
  'no-hot-water': {
    title: 'No hot water? 6 things to check before you call',
    h1: 'No hot water? Check these first',
    desc: 'Water heater not heating, or running out fast? Six safe checks for gas and electric tanks, and when to call a licensed New Jersey plumber.',
    intro: 'A tripped breaker or a pilot light that went out causes many no-hot-water calls. These checks take a few minutes and need no tools.',
    checks: [
      ['Check more than one faucet', 'If only one faucet runs cold, the problem is at that fixture, not the water heater.'],
      ['Electric tank: check the breaker', 'Look for a tripped breaker labeled water heater. Reset it once. If it trips again, leave it off and call.'],
      ['Gas tank: look at the status light or pilot', 'Many gas heaters have a small window or a blinking light near the bottom. If the pilot is out, the relighting steps are printed on the tank. Only follow them if you do not smell gas.'],
      ['Check the temperature dial', 'Someone may have turned it down or set it to vacation mode. Most homes use about 120 degrees.'],
      ['Think about recent use', 'Back-to-back showers, laundry, and the dishwasher can empty a tank. Give it an hour and try again.'],
      ['Look for water around the tank', 'A puddle under the heater means a leak, which is a different problem. Start a request for a leaking water heater instead.']
    ],
    stop: ['You smell gas near the water heater. Leave and call 911 or your gas utility from outside.', 'The breaker trips a second time.', 'The pilot will not stay lit.', 'You see water, rust streaks, or scorch marks on the tank.'],
    meanwhile: ['Do not turn the temperature dial to its highest setting to make up for it.', 'If the tank is leaking, shut the cold water valve on the pipe above it.', 'Note the brand and the age on the label for the plumber.']
  }
};
