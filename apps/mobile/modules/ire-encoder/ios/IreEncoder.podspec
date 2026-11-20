Pod::Spec.new do |s|
  s.name           = 'IreEncoder'
  s.version        = '1.0.0'
  s.summary        = 'Ire scroll video encoder (AVAssetWriter H.264 + AAC) for mongmangE'
  s.description    = 'Local Expo module: raw RGBA frames in order -> H.264 MP4 (+ AAC). Container finalization is done in JS.'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'mongmangE'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreMedia', 'CoreVideo', 'Accelerate'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
