// Original, locally stored passage library. Plain ASCII only so every keyboard
// (desktop and mobile) can type it. Each sentence stands alone, so sentences
// from the same theme can be assembled in any order.

export type Theme =
  | 'racing'
  | 'engineering'
  | 'strategy'
  | 'pitstops'
  | 'technology'
  | 'travel'
  | 'nature';

export const LIBRARY: Record<Theme, readonly string[]> = {
  racing: [
    'The grid fell silent as twenty engines settled into a low, impatient rumble.',
    'A clean start is worth more than a brave first corner, so the best drivers stay calm when the lights go out.',
    'He braked a fraction later than his rival and slipped down the inside without touching the kerb.',
    'Rain began to fall on the far side of the circuit while the main straight stayed completely dry.',
    'Every lap is a conversation between the driver, the tires, and the track surface beneath them.',
    'The leader had a gap of four seconds, but the chasing car was faster through every sector.',
    'Racing at night changes the rhythm of a circuit, because braking markers disappear into the shadows.',
    'She defended the inside line for six laps before finally conceding the position on the long straight.',
    'A slipstream can add several kilometers per hour, which is often enough to set up an overtake.',
    'The final chicane rewards patience, since a car that runs wide there loses the whole exit.',
    'After the safety car pulled in, the restart turned into a frantic sprint to the first braking zone.',
    'Champions are rarely the fastest on a single lap; they are the ones who make the fewest mistakes.',
    'The crowd rose to its feet as two cars crossed the line side by side, separated by a few centimeters.',
    'On the cool-down lap, the winner waved to every grandstand and thanked the marshals for their work.',
    'A good racer studies the onboard footage the night before and memorizes every bump in the road.'
  ],
  engineering: [
    'Downforce pushes the car into the track, allowing it to corner at speeds that would otherwise be impossible.',
    'Engineers balance drag against grip, because a wing that helps in the corners will slow the car on the straights.',
    'Carbon fiber is prized for being both incredibly stiff and remarkably light for its size.',
    'The hybrid system harvests energy under braking and releases it later as a burst of extra power.',
    'Tiny changes to the floor of a racing car can transform the way air flows underneath it.',
    'Brake discs can glow orange at the end of a long straight, reaching temperatures above one thousand degrees.',
    'A wind tunnel model is built with extraordinary precision so its results match the full-size car.',
    'Suspension engineers tune springs and dampers so the tires stay in contact with the road over every bump.',
    'Telemetry streams hundreds of channels of data back to the garage on every single lap.',
    'Cooling is a constant compromise, since larger radiator openings also create more aerodynamic drag.',
    'The steering wheel holds dozens of switches that let the driver adjust the car from corner to corner.',
    'Simulation tools allow a team to test thousands of setups before the car ever leaves the factory.',
    'Weight distribution matters as much as total weight, because it changes how the car rotates into a turn.',
    'A gearbox must survive thousands of shifts per race while changing gear in a few milliseconds.'
  ],
  strategy: [
    'The strategist watched the gap on the timing screen and decided to keep the car out for two more laps.',
    'An undercut works when fresh tires are fast enough to gain back the time lost in the pit lane.',
    'Sometimes the best strategy is the simplest one, and the team that avoids complications wins the day.',
    'Fuel loads, tire wear, and traffic all combine into a puzzle that changes with every passing lap.',
    'A late safety car can turn a perfect plan into a gamble, so teams prepare several options in advance.',
    'Track position is valuable on narrow circuits where overtaking is almost impossible.',
    'The team split its strategies so that at least one car would benefit if the weather changed.',
    'Reading the race well means reacting quickly without abandoning a plan at the first sign of trouble.',
    'Clean air allows a car to run at its true pace, while a car stuck in traffic overheats its tires.',
    'Good communication between driver and pit wall can be worth more than a tenth of a second per lap.',
    'Every decision is a probability, and great strategists accept that some correct calls still lose.',
    'Managing the gap behind is just as important as chasing the car ahead.'
  ],
  pitstops: [
    'A modern pit stop is choreographed down to the smallest movement of every mechanic involved.',
    'Twenty people can change four tires in barely more than two seconds when everything goes right.',
    'The car must stop precisely on its marks, or the wheel guns will not line up with the nuts.',
    'Soft tires offer more grip but wear out quickly, while hard tires last longer and feel less sharp.',
    'Tire warmers keep the rubber at its working temperature until the moment the car leaves the garage.',
    'A sticky wheel nut can cost several seconds and ruin an otherwise flawless race.',
    'Pit crews rehearse hundreds of stops between races to make every motion automatic.',
    'The pit lane speed limit exists to protect the crews who work only a few steps from moving cars.',
    'Graining appears when a tire slides across the surface and small strips of rubber roll up on the tread.',
    'An unsafe release can lead to a penalty, so the lollipop signal is only given when the lane is clear.',
    'Fresh tires feel wonderful for a few laps, but the driver must still respect their limits.',
    'Mechanics often celebrate a fast stop with a quick fist bump before resetting their equipment.'
  ],
  technology: [
    'A good password is long, unique, and stored somewhere safer than a sticky note on the monitor.',
    'Modern processors contain billions of transistors, each far smaller than a grain of dust.',
    'The first computers filled entire rooms, yet a phone in your pocket is millions of times more powerful.',
    'Software is never truly finished; it simply reaches a version that is good enough to share.',
    'Typing quickly is useful, but typing accurately saves far more time in the long run.',
    'Batteries store energy through chemical reactions that can be reversed when they are recharged.',
    'A satellite in low orbit circles the planet roughly every ninety minutes.',
    'Open standards allow devices from different makers to communicate without special adapters.',
    'Clear documentation turns a clever piece of code into a tool that other people can actually use.',
    'Most bugs are found not by brilliant insight but by patiently reading what the program really does.',
    'Light travels through fiber optic cables by bouncing along the inside of thin strands of glass.',
    'A well designed interface feels invisible, because the user never has to think about how it works.',
    'Backups are only useful if someone has checked that they can actually be restored.'
  ],
  travel: [
    'The night train rolled through the mountains while passengers watched villages glow in the valleys.',
    'A good map is helpful, but asking a local for directions often leads to better discoveries.',
    'The market opened at dawn, filling the narrow street with the smell of fresh bread and ripe fruit.',
    'Packing light makes every journey easier, especially when the stairs at the station are steep.',
    'They reached the summit just before sunrise and watched the clouds turn from gray to gold.',
    'Learning a few words of the local language is a small effort that people always appreciate.',
    'The ferry crossed the bay slowly, giving everyone time to watch the coastline fade into the haze.',
    'Some of the best meals are found in small kitchens with handwritten menus and no sign outside.',
    'A long road trip teaches patience, especially when the next town is farther than the map suggested.',
    'The old harbor was crowded with fishing boats painted in bright blues, reds, and yellows.',
    'Travel is less about collecting places and more about noticing how other people live.',
    'At the border, the landscape changed from green fields to dry hills almost within an hour.'
  ],
  nature: [
    'Honeybees communicate the location of flowers by performing a dance inside the hive.',
    'An oak tree can support hundreds of different species, from tiny insects to nesting birds.',
    'Lightning heats the air around it to temperatures several times hotter than the surface of the sun.',
    'Octopuses can change both the color and the texture of their skin in a fraction of a second.',
    'The tide rises and falls twice each day, pulled by the gravity of the moon and the sun.',
    'Some seeds can remain dormant for decades and still sprout when conditions finally become right.',
    'Snow looks white because its many tiny crystals scatter every color of light equally.',
    'Migrating birds use the stars, the sun, and even the magnetic field of the earth to find their way.',
    'Coral reefs cover a tiny part of the ocean floor yet shelter an enormous share of marine life.',
    'A single cloud can hold thousands of tons of water, suspended as countless microscopic droplets.',
    'Forests breathe in a slow rhythm, releasing moisture that helps form rain far away.',
    'The deepest parts of the ocean remain darker and less explored than the surface of the moon.',
    'Wolves travel long distances each day, following the movements of the herds they hunt.'
  ]
};

export const THEMES = Object.keys(LIBRARY) as Theme[];
