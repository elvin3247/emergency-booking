// The "What's wrong?" guide at /whats-wrong: every problem, grouped by where it happens in the house,
// with when it can't wait, when it usually can, and what to do first. Edit the wording here, then run `npm run build`.
// Keep it to safe, tool-free steps. A problem only shows while its service is switched on in config.js.
module.exports = {
  areas: [
    { key: 'basement', name: 'Basement and utility room', intro: 'Where the furnace or boiler, the water heater, the sump pump, and the main water valve usually live.' },
    { key: 'kitchen-bath', name: 'Kitchen and bathrooms', intro: 'Sinks, tubs, and toilets. Most problems here start at one fixture, so check whether other drains are affected.' },
    { key: 'walls', name: 'Walls, ceilings, and thermostat', intro: 'Pipes run inside walls and ceilings. Outlets, switches, lights, the breaker panel, and the thermostat live here too.' },
    { key: 'attic-outside', name: 'Attic and outside', intro: 'Many homes have the air handler in the attic and the AC or heat pump unit outside.' }
  ],
  problems: {
    'no-heat': {
      area: 'basement',
      now: ['It is near or below freezing outside, or will be tonight.', 'Babies, older adults, or anyone with a health condition is in the house.', 'You also smell gas or a carbon monoxide alarm is sounding: leave and call 911 from outside.'],
      wait: 'In mild weather, with a safe way to stay warm, it can often wait for a daytime visit.',
      first: ['Check that the thermostat is set to Heat and has power.', 'Make sure the switch on or near the furnace or boiler is on.', 'In freezing weather, open cabinet doors under sinks and let faucets drip.']
    },
    noise: {
      area: 'basement',
      now: ['You smell burning or something electrical, or see smoke: turn the system off at the thermostat. If there is smoke, leave and call 911.', 'Loud banging or grinding started suddenly.'],
      wait: 'A new, mild noise with no smell can usually wait for a daytime visit. Turn the system off if it gets louder.',
      first: ['Turn the system off at the thermostat.', 'Note what the noise sounds like and when it happens. It helps the pro.']
    },
    'no-hot-water': {
      area: 'basement',
      now: ['You smell gas near the water heater: leave and call 911 or your gas utility from outside.', 'There is also water under the tank.'],
      wait: 'No hot water on its own is rarely dangerous. It can usually wait for a same-day or next-day visit.',
      first: ['Check more than one faucet.', 'Electric tank: check the breaker. Gas tank: look at the pilot or status light.']
    },
    'wh-leak': {
      area: 'basement',
      now: ['Water is coming from the bottom of the tank.', 'Water is spreading toward outlets, the furnace, or finished floors.'],
      wait: 'A slow drip from a fitting on top of the tank can usually wait a day, with the cold valve shut and a pan under it.',
      first: ['Shut the cold water valve on the pipe into the top of the tank.', 'Turn off the breaker (electric) or set the gas knob to Off or Pilot.']
    },
    sump: {
      area: 'basement',
      now: ['It is raining, or the water in the pit is near the top.', 'Water is already on the basement floor.'],
      wait: 'In dry weather with a low pit, it can usually wait for a daytime visit. Get it fixed before the next storm.',
      first: ['Do not step in water that may touch outlets or cords.', 'Press Reset on the pump outlet and check the breaker.', 'Free the float if it is stuck against the side of the pit.']
    },
    clog: {
      area: 'kitchen-bath',
      now: ['Sewage is coming up through a tub, shower, or floor drain.', 'Several drains in the house are backing up at once.'],
      wait: 'One slow sink or tub, with other drains working, can usually wait for a daytime visit.',
      first: ['Stop running water and flushing until it clears.', 'Check whether other drains are slow too. That tells the plumber where to look.']
    },
    toilet: {
      area: 'kitchen-bath',
      now: ['It is overflowing and will not stop, even with the valve turned off.', 'It is your only toilet and it will not flush.'],
      wait: 'A toilet that runs nonstop or flushes weakly can usually wait. Turn the valve behind it off between uses.',
      first: ['Turn the valve behind the toilet clockwise to stop the water.', 'Do not flush again until the bowl drains.']
    },
    'burst-pipe': {
      area: 'walls',
      now: ['Water is spraying or pouring.', 'Water is coming through a ceiling, or the ceiling is sagging. Stay out from under it.', 'Water is near outlets, lights, or the electrical panel.'],
      wait: 'A slow drip you can catch in a bucket can sometimes wait for the morning, if you shut the water off.',
      first: ['Shut the main water valve, usually where the water line enters the basement or near the water meter.', 'Open a faucet on the lowest floor to drain the pipes.', 'Turn off power to wet areas only if you can reach the panel from a dry spot.']
    },
    thermostat: {
      area: 'walls',
      now: ['The heat is out too, and it is freezing outside.'],
      wait: 'A blank or unresponsive thermostat usually is not urgent if the house is a safe temperature.',
      first: ['Replace the batteries if it has them.', 'Check the breaker for the furnace or air handler. Many thermostats lose power when the system does.']
    },
    leak: {
      area: 'attic-outside',
      now: ['Water is coming through a ceiling below an attic unit.', 'Water is near outlets, wiring, or the furnace burners.'],
      wait: 'A small puddle near the unit, caught early, can usually wait a day with the system turned off.',
      first: ['Turn the system off at the thermostat. This stops most condensate overflow.', 'Put a pan or towels down and move anything stored nearby.']
    },
    'no-cooling': {
      area: 'attic-outside',
      now: ['It is a heat wave and babies, older adults, or anyone with a health condition is in the house.', 'You smell burning or the outdoor unit is buzzing loudly but not running: turn it off.'],
      wait: 'On a mild day, no cooling can usually wait for a daytime visit.',
      first: ['Set the thermostat to Cool and a few degrees below room temperature.', 'Check the breakers for the AC and the indoor unit, and replace a dirty filter.', 'If the outdoor unit is iced over, turn the system off and let it thaw.']
    },
    // Electrical and appliances: these show on /whats-wrong once those services are switched on in config.js.
    'power-out': {
      area: 'walls',
      now: ['You see sparks, smoke, or scorch marks, or smell burning plastic: leave and call 911.', 'Lights flicker or dim across the house.', 'Part of the house has no power in freezing weather. Most heating needs power to run.'],
      wait: 'One dead room or outlet, with no smell or heat, can usually wait for a daytime visit.',
      first: ['Check the breaker panel for a tripped breaker and reset it once.', 'Press Test, then Reset, on outlets with buttons in the kitchen, bathrooms, garage, and outside.', 'Ask a neighbor or check your utility to rule out an outage.']
    },
    breaker: {
      area: 'walls',
      now: ['It trips again right away, even with things unplugged.', 'The panel feels hot, buzzes, or shows scorch marks. Do not touch it.'],
      wait: 'If it only trips when one appliance runs, unplug that appliance and it can usually wait.',
      first: ['Unplug what is on that circuit, then reset the breaker once.', 'Do not keep resetting a breaker that trips again. It is protecting the wiring.']
    },
    outlet: {
      area: 'walls',
      now: ['The outlet or switch is warm, buzzing, sparking, or scorched.'],
      wait: 'A dead outlet with no heat or smell can usually wait.',
      first: ['Stop using it and unplug anything plugged in.', 'If it is warm or buzzing, switch off its breaker.']
    },
    fridge: {
      area: 'kitchen-bath',
      now: ['You have medicine, like insulin, that must stay cold.', 'Water is leaking toward outlets or under the floor.'],
      wait: 'A closed fridge keeps food cold for about 4 hours, and a full freezer for about 2 days, so a same-day visit is usually fine.',
      first: ['Keep the doors closed.', 'Check that it is plugged in, its breaker is on, and the temperature dial was not bumped.', 'Clear anything blocking the vents inside.']
    },
    kitchen: {
      area: 'kitchen-bath',
      now: ['You smell gas near the stove: leave and call 911 or your gas utility from outside.', 'A burner or the oven will not turn off.'],
      wait: 'An oven, stove, or dishwasher that will not start can usually wait for a daytime visit.',
      first: ['Turn it off and unplug it, or switch off its breaker.', 'If the dishwasher is leaking, turn off the valve under the sink.']
    },
    laundry: {
      area: 'basement',
      now: ['You smell burning from the dryer: turn it off and unplug it. If there is smoke, leave and call 911.', 'The washer is leaking and water is spreading.'],
      wait: 'A washer or dryer that will not start can usually wait for a daytime visit.',
      first: ['If the washer leaks, turn off the two water valves behind it.', 'Clean the dryer lint screen and check that the vent hose is not crushed.', 'Check the breaker, and that the door is fully closed.']
    }
  }
};
