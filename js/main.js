/*

* Freedom Transit Busline Real-Time GPS Tracking Page
* Developed by Jordan Bechek
* Designed and styled by Chris Frydryck
* Project by Michael Mann, Chris Frydryck, and Jordan Bechek of Washington & Jefferson College, 2018
* File: main.js
* Notes:
   - Page should be disabled on Sunday since no busses will be out
   - Last updated: 4/21/18

*/

// routeInfo[] defined in paths.js - {name, startTime, endTime, subRouteInfo[], link, path}

var date = new Date();           // date object
var day = date.getDay();         // get day of week
var hour = date.getHours();      // get hour of day
var minute = date.getMinutes();  // get minutes of hour

// test weekend function
// day = 3;

// test time constraints
// hour = 14;

// create icon set
var icons = {
   freedom_bus: {
      icon: "img/bus.png"
   },
   blank_bus: {
      icon: "img/blank.png"
   }
};

var busses = [];  // array of bus objects - {id, route, marker, lat, lng}
var map;          // map object
var currRoute;    // current route (0-5)
var interval;     // interval for updateBusses() function cycle

// used to fix bus not showing if new route is selected but the bus isn't moving
// without this, the bus would not appear for a newly-selected route until it began to move again
// true if markers are being placed for the first time since map has been (re-)drawn
var firstShow = true;

// default current route to appropriate Metro Commuter route
(day === 6) ? currRoute = 1 : currRoute = 0;

// add default style if using device with window width higher than 480 pixels
if(currRoute === 0) {
   $("#metroWeekday").css("background-color", "#D66C04");

   if($(window).width() > 480) {
      $("#metroWeekday").css("border-left", "7px solid #8D5300");
   }
} else if(currRoute === 1) {
   $("#metroWeekend").css("background-color", "#D66C04");

   if($(window).width() > 480) {
      $("#metroWeekend").css("border-left", "7px solid #8D5300");
   }
}

// set date on calendar icon
$(".calDate").html(date.getDate());

// if today is Saturday, enable Metro Commuter (Weekend) and Local (Saturday)
// if today is not Saturday, enable Metro Commuter (Weekday), County Line, 
// Local A, and Local B
if(day === 6) {
   $("#metroWeekend").addClass("clickable");
   $("#localSat").addClass("clickable");
} else {
   $("#metroWeekday").addClass("clickable");
   $("#countyLine").addClass("clickable");
   $("#localA").addClass("clickable");
   $("#localB").addClass("clickable");
}

// configuration for firebase connection
var config = {
   apiKey: "AIzaSyB2dXGVK7S9iWtwGsw_gpm7Q-DAtSMIdsE",
   authDomain: "freedom-transit-live-tracker.firebaseapp.com",
   databaseURL: "https://freedom-transit-live-tracker.firebaseio.com/",
   storageBucket: "gs://freedom-transit-live-tracker.appspot.com/",
   messagingSenderId: "224494441810"
};

// create firebase database object
firebase.initializeApp(config);
var database = firebase.database();

// draw map
function initMap(routeChanged,path,zoom,center) {
   var localRouteCoords;

   if(routeChanged === "yes") {

      // create map with parameters
      map = new google.maps.Map(document.getElementById("map"), {
         zoom: zoom,
         center: center,
         gestureHandling: "greedy"
      });

      // use path parameter to draw polyline on map
      localRouteCoords = path;

      var localPath = new google.maps.Polyline({
         path: localRouteCoords,
         geodesic: true,
         strokeColor: '#0088FF',
         strokeOpacity: 0.6,
         strokeWeight: 6
      });

      localPath.setMap(map);
   } else {
      if(currRoute === 0) { // weekday default: Metro Commuter (Weekday) (0)
         localRouteCoords = routeInfo[0].path;

         map = new google.maps.Map(document.getElementById("map"), {
            zoom: 10,
            center: {lat: 40.3, lng: -80.16},
            gestureHandling: "greedy"
         });
      } else { // weekend default: Metro Commuter (Weekend) (1)
         localRouteCoords = routeInfo[1].path;

         map = new google.maps.Map(document.getElementById("map"), {
            zoom: 11,
            center: {lat: 40.26, lng: -80.2},
            gestureHandling: "greedy"
         });
      }

      var localPath = new google.maps.Polyline({
         path: localRouteCoords,
         geodesic: true,
         strokeColor: '#0088FF',
         strokeOpacity: 0.6,
         strokeWeight: 6
      });

      localPath.setMap(map);
   }

   // check if the busses are currently running given selected route and current hour
   if(validTimeCheck()) {
      updateBusses();

      // set bus refresh cycle (every 5 seconds)
      interval = setInterval(function() {
         updateBusses();
      }, 5000);
   } else {

      // create error message to handle invalid time
      var message = document.createElement("div");
      message.id = "invalidTimeMessage";
      message.innerHTML = "Busses are no longer running on the selected route<br><a href=\"" + 
      routeInfo[currRoute].link + "\">See Schedule</a>";

      var messageDiv = document.createElement("div");
      messageDiv.id = "invalidTimeDiv";
      messageDiv.appendChild(message);

      // push message to center of map
      map.controls[google.maps.ControlPosition.CENTER].push(messageDiv);
   }
}

// draw bus markers on map
function updateBusses() {

   // get instance of locations/ from firebase
   var location = database.ref('locations/');
   var lat, lng, marker, key, index, routeNum, subRouteNum;

   // array of bus IDs in database to check against busses[]
   var dbBusRef = [];

   // get snapshot of locations/ to cycle through children (busses)
   location.once("value", function(snapshot) {
      snapshot.forEach(function(childSnapshot) {

         // save bus id
         key = parseInt(childSnapshot.key);

         // add ID
         dbBusRef.push(key);

         // cycle through grandchildren (bus attributes (lat, lng, speed, etc.)) to save lat and lng
         childSnapshot.forEach(function(grandchildSnapshot) {
            (grandchildSnapshot.key === "latitude") ? lat = grandchildSnapshot.val() : lat = lat;
            (grandchildSnapshot.key === "longitude") ? lng = grandchildSnapshot.val() : lng = lng;
         });

         // get route from tablet's ID
         routeNum = (Math.floor(key/1000))-1;

         // check if current bus is on the user-selected route
         if(routeNum === currRoute) {

            // get array index of this bus, returns -1 if not in the array
            index = busses.findIndex(x => x.id === key);

            if(index > -1) {
            
               // console.log("array lat: " + busses[index].lat + ", new lat: " + lat);
               // console.log("first show: " + firstShow);

               // check if this bus has moved since the last refresh; if firstShow, add regardless
               if(firstShow || (Math.abs(busses[index].lat - lat) > 0.00001 || 
                  Math.abs(busses[index].lng - lng) > 0.00001)) {

                  // remove marker
                  busses[index].marker.setMap(null);

                  // create new marker
                  if(currRoute === 0 || currRoute === 2) {
                     marker = new google.maps.Marker({
                        position: {lat: lat, lng: lng},
                        map: map,
                        icon: icons["blank_bus"].icon,
                        label: {
                           text: getLabel(key),
                           fontSize: "15px",
                           fontWeight: "bold"
                        }
                     });
                  } else {
                     marker = new google.maps.Marker({
                        position: {lat: lat, lng: lng},
                        map: map,
                        icon: icons["freedom_bus"].icon
                     });
                  }

                  // replace bus object
                  busses[index] = {id: key, route: routeNum, marker: marker, lat: lat, lng: lng};
               }
            } else {
               if(currRoute === 0 || currRoute === 2) {
                  marker = new google.maps.Marker({
                     position: {lat: lat, lng: lng},
                     map: map,
                     icon: icons["blank_bus"].icon,
                     label: {
                        text: getLabel(key),
                        fontSize: "15px",
                        fontWeight: "bold"
                     }
                  });
               } else {
                  marker = new google.maps.Marker({
                     position: {lat: lat, lng: lng},
                     map: map,
                     icon: icons["freedom_bus"].icon
                  });
               }

               // add bus object
               busses.push({id: key, route: routeNum, marker: marker, lat: lat, lng: lng});
            }
         }
      });

      firstShow = false;
      // console.log("refreshed");

      updateBusArray(dbBusRef);
      // console.log("dbBusRef: " + dbBusRef);
      // console.log("busses: " + busses);
   });
}

// check time for user-selected route
function validTimeCheck() {

   // check if current time is within route constraints; time invalid regardless if today is Sunday
   if((hour > routeInfo[currRoute].startTime && hour < routeInfo[currRoute].endTime) && day !== 0) {
      return true;
   }
}

// determine label for bus (non-local routes only)
function getLabel(id) {
   var label;

   // get second integer of ID; this is the subroute ID
   var x = Math.floor(id/(Math.pow(10, Math.floor(Math.log(id)/Math.log(10))-1)));
   var subRoute = x-Math.floor(x/10)*10;

   // calculate minutes since midnight
   var totalMinutes = minute + hour*60;

   for(var i = 0; i < routeInfo[currRoute].subRouteInfo[subRoute].labels.length; i++) {
      if(totalMinutes >= routeInfo[currRoute].subRouteInfo[subRoute].labels[i].startTime && 
         totalMinutes <= routeInfo[currRoute].subRouteInfo[subRoute].labels[i].endTime) {

         return routeInfo[currRoute].subRouteInfo[subRoute].labels[i].id;
      }
   }
}

// purge busses from array that are no longer in the database
function updateBusArray(ref) {
   if(ref.length !== busses.length) {
      var match = false;

      for(var i = 0; i < busses.length; i++) {
         match = false;

         for(var k = 0; k < ref.length; k++) {
            if(busses[i].id === ref[k]) {
               match = true;
               break;
            }
         }

         if(!match) {
            busses[i].marker.setMap(null);
            busses.splice(i, 1);
         }
      }
   }
}

$(".menuItem.clickable").on("click", function() {
   $(".menuItem").each(function() {
      $(this).css("font-weight", "normal").css("background-color", "#d57f2a").css("border-left", "0px");
   });

   $(this).css("font-weight", "bold").css("background-color", "#D66C04");

   // added this to fix select issues at small screen size
   if($(window).width() > 480) {
      $(this).css("border-left", "7px solid #8D5300");
   }

   // reset cycle (this is important)
   clearInterval(interval);

   // reset firstShow
   firstShow = true;

   if($(this).attr("id") === "metroWeekday") { // Metro Commute (Weekday)
      currRoute = 0;
      initMap("");
   } else if($(this).attr("id") === "metroWeekend") { // Metro Commute (Weekend)
      currRoute = 1;
      initMap("");
   } else if($(this).attr("id") === "countyLine") { // County Line
      currRoute = 2;
      initMap("yes", routeInfo[2].path, 11, {lat: 40.275, lng: -80.241});
   } else if($(this).attr("id") === "localA") { // Local A
      currRoute = 3;
      initMap("yes", routeInfo[3].path, 13, {lat: 40.175, lng: -80.25});
   } else if($(this).attr("id") === "localB") { // Local B
      currRoute = 4;
      initMap("yes", routeInfo[4].path, 13, {lat: 40.176, lng: -80.25407});
   } else if($(this).attr("id") === "localSat") { // Local Saturday
      currRoute = 5;
      initMap("yes", routeInfo[5].path, 13, {lat: 40.176, lng: -80.25});
   }
});

// remove tile side borders if window is shrunk past a width of 480 pixels
$(window).on("resize", function() {
   if($(this).width() <= 480) {
      $(".menuItem").css("border-left", "0px");
   }
});
