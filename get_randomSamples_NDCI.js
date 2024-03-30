// import the javascript file with common functions 
const commonFunctions = require('./common.js');
/*------ part-1. get the NDCI map 
 year: the target identification year
 startDoy: the start Doy of optimal identification window
 endDoy: the end Doy of optimal identification window
 roi: target region of study
 output value of this function is the time series NDCI images in a given time period 
------*/
function get_NDCI_map(year,startDoy,endDoy,roi){
	// define the start and end time of identification
	var startDate = ee.Date.fromYMD(year, 1, 1).advance(startDoy, 'day'); 
	var endDate = ee.Date.fromYMD(year, 1, 1).advance(endDoy, 'day'); 
	// define the image collection
	var s2SR_imagCol = commonFunctions.sentinel2_collection(ee.Date.fromYMD(year, 1, 1),
                                       ee.Date.fromYMD(year, 12, 31),roi);	
	// Create a date range list with a specified 10-day interval，use millis as unit
	var dates = ee.List.sequence(startDate.millis(), endDate.millis(), 1000 * 60 * 60 * 24 * 10); 
	// Apply the time resampling function using map()
	var resampledImages = ee.ImageCollection(dates.map(commonFunctions.resampleTo10Days));
	resampledImages = resampledImages.map(commonFunctions.addLSWI);
	resampledImages = resampledImages.map(commonFunctions.addEVI);
	resampledImages = resampledImages.map(commonFunctions.addNDCI);
	// get the BSMI index and the remove the outlier pixels as 0
	var NDCI_Images = resampledImages.map(function(image) {
		var LSWI = image.select('LSWI');
		var EVI = image.select('EVI');
		var mask = (EVI.lte(0.35)).and(LSWI.add(ee.Image.constant(0.05)).gte(EVI));
		var valid_mask = mask.not();
		var NDCI = image.select('NDCI');
		NDCI = NDCI.multiply(valid_mask).rename('NDCI_mask');
		NDCI = NDCI.toInt16();
		image = image.addBands(NDCI);
		return image.select('NDCI_mask');
	})
	print('NDCI_Images',NDCI_Images);	
	return NDCI_Images;
}

/*------ part-2. get the random sample in each 1°×1° grid
 this function use the ESA landMap as cropland mask
 roi: target region of study
 sampleSize: the random sample size in each grid, the default size is 0.1% of the number of pixels in each grid
 output value of this function is random samples in a given grid and given size
------*/ 
function get_random_sample(roi, sampleSize){
	var ESA_landmap = ee.ImageCollection("ESA/WorldCover/v100");
	var ESA_croplandMask = ESA_landmap.first().eq(40);
	if (sampleSize === undefined){
		sampleSize = 124000;
	}		
	var randomPoints = ee.FeatureCollection.randomPoints({
		region: roi,
		points: sampleSize,  
		seed: 1234  
	});
	// filter the sample use cropland mask	
	var roi_croplandMask = ESA_croplandMask.clip(roi);
	roi_croplandMask = roi_croplandMask.updateMask(roi_croplandMask);
	var maskedPoints = randomPoints.map(function(point) {
		var isInsideMask = roi_croplandMask.reduceRegion({
			reducer: ee.Reducer.first(),
			geometry: point.geometry(),
		scale: 10,
		maxPixels: 1
		}).getNumber('Map');
		return point.set('inside_mask', isInsideMask);
	});
  var finalPoints = maskedPoints.filter(ee.Filter.eq('inside_mask', 1));
  return finalPoints;
}
  
/*------ part-3. extract the NDCI value of each image for each random point
 imgCol: the extracted time series images
 pts: extraction points
 this funtion runs to derive the image values of given samples 
------*/  
function extract_points_value(imgCol, pts){
	var ft = ee.FeatureCollection(ee.List([]));
	var fill = function(img, ini){
      var date = img.date().format();
      var inift = ee.FeatureCollection(ini)
      var ft2 = img.sampleRegions({
        collection:pts,
        properties:ee.List(['ID']),
        scale:10
      });
      var ft3 = ft2.map(function(f){return f.set("date", date)})
      return inift.merge(ft3)
    }
	var newft = ee.FeatureCollection(imgCol.iterate(fill,ft));
	Export.table.toDrive({
      collection: newft,
      description: 'testRegion_cropSamples_VI',
      folder: 'cropSamples_VI',
      fileFormat: 'CSV'
    });
}	

/*----main producer of get_NDCI_samples
 year: the target identification year
 startDoy: the start Doy of optimal identification window, the default value in HLJ, China is 180 
 endDoy: the end Doy of optimal identification window, the default value in HLJ, China is 240
 roi: target region of study
----*/
function get_NDCI_sample(year,startDoy,endDoy,roi){
	var imgCol = get_NDCI_map(year,startDoy,endDoy,roi);
	var pts = get_random_sample(roi);
	extract_points_value(imgCol, pts);
}	
  
