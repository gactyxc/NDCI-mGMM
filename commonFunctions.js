/*----- function to get the sentinel-2 image collection based on the study data range and study area ----*/
// function to remove cloud
// function to exclude bad data at scene edges
function maskEdges(s2_img) {
  return s2_img.updateMask(
      s2_img.select('B8A').mask().updateMask(s2_img.select('B9').mask()));
}
  // Function to mask clouds in Sentinel-2 imagery.
function maskClouds(img) {
  var max_cloud_probabiltly = 50;
  var clouds = ee.Image(img.get('cloud_mask')).select('probability');
  var isNotCloud = clouds.lt(max_cloud_probabiltly);
  return img.updateMask(isNotCloud);
}
function sentinel2_collection(start_data,end_data,roi){
  var s2Sr = ee.ImageCollection("COPERNICUS/S2_HARMONIZED");
  var s2Clouds = ee.ImageCollection("COPERNICUS/S2_CLOUD_PROBABILITY")
  //define the filter constraints
  var criteria = ee.Filter.and(
     ee.Filter.bounds(roi), ee.Filter.date(start_data, end_data));
  //sentinel-2 data collection 
  var sentinel2_bands = ['B1','B2','B3','B4','B5','B6','B7','B8','B8A','B9','B11','B12'],
      new_bands = ['Aerosols','B','G','R','RE1','RE2','RE3','NIR','RE4','Water Vapor','SWIR1','SWIR2'];
  // ---Filter input collections by desired data range and region.
  s2Sr = s2Sr.filter(criteria).map(maskEdges);
  s2Clouds = s2Clouds.filter(criteria);
  // ---Join S2 SR with cloud probability dataset to add cloud mask.
  var s2SrWithCloudMask = ee.Join.saveFirst('cloud_mask').apply({
    primary: s2Sr,
    secondary: s2Clouds,
    condition:
        ee.Filter.equals({leftField: 'system:index', rightField: 'system:index'})
    });
  // ---collect the images without cloud
  var s2CloudMasked =ee.ImageCollection(s2SrWithCloudMask).map(maskClouds)
            .select(sentinel2_bands,new_bands);
  var s2SR_imgCol = s2CloudMasked//.select(sentinel2_bands,new_bands);//s2CloudMasked   s2Sr;
  return s2SR_imgCol;
}

/*----- function to resample time resolution of image collection to 10 day  ------*/
// define a function for resampling with a 10-day interval
function resampleTo10Days(date){
  var currentDate = ee.Date(date); 
  var endDate = currentDate.advance(10, 'day');
  var summarizedImageCol = s2SR_imagCol.filterDate(currentDate, endDate);
  var summarizedImage = summarizedImageCol.median();
  summarizedImage = summarizedImage.set('system:time_start', currentDate);
  return summarizedImage;
}

/*----- function to add all related VIs ----*/
// add NDCI, a normalized difference composite index for maize identification 
function addNDCI(img){
  var NDCI = img.expression('NDCI = 2500 * (10000-SWIR1 - G) / (7.5 * RE1 - SWIR1 + 20000)',{
                                'RE1':img.select('RE1'),
                                'G': img.select('G'),
                                'SWIR1':img.select('SWIR1')
  });
  img = img.addBands(NDCI);
  img = img.toInt16();
  return img;
}
// add LSWI
function addLSWI(image){
  var LSWI = image.expression('LSWI = (NIR - SWIR1) / (NIR + SWIR1)',{
                                'SWIR1':image.select('SWIR1'),
                                'NIR': image.select('NIR')}); 

  return image.addBands(LSWI);
}
// add EVI
function addEVI(image){
  var EVI = image.expression('EVI = 2.5 * (NIR - R) / (NIR + 6 * R - 7.5 * B + 10000)',{
                                   'NIR':image.select('NIR'),
                                   'R': image.select('R'),
                                   'B': image.select('B')}); 
  return image.addBands(EVI);
}


 