import got from 'got'
import { parse } from 'node-html-parser'

enum SemesterCodes {
  'winter' = 1, // Opens Early November - given super low priority
  'spring' = 2, // Opens in Late November?
  'summer' = 6, // Opens in Mid March
  'fall' = 9, // Opens May
}

const fetchBinghamtonCourse = async (
  crn: number,
  semester: SemesterCodes = assumeTargetSemester(),
  year: number = new Date().getFullYear()
) => {
  const { body } = await got.get(
    `https://ssb.cc.binghamton.edu/banner/bwckschd.p_disp_detail_sched?term_in=${year}${semester}0&crn_in=${crn}`
  )
  const html = parse(body)
  const errorText = html.querySelector('.errortext')
  if (errorText) {
    throw new TypeError(
      `${errorText.textContent}, make sure the CRN and semester are correct.`
    )
  }
  const courseInformation = html
    .querySelector('th.ddlabel')
    .textContent.split(' - ')

  // using pop() instead of [a, b, c] syntax due to courses with " - " in their names
  const courseSection = courseInformation.pop()
  const courseAbbreviatedName = courseInformation.pop()
  const courseRegistrationNumber = courseInformation.pop()
  const courseName = courseInformation.join(' - ')

  if (!courseRegistrationNumber || crn !== +courseRegistrationNumber) {
    throw new Error(
      `A webscraping error occurred, CRNs did not match. | ${crn} : ${courseRegistrationNumber}`
    )
  }

  const capacity = +html.querySelector('td.dddefault:nth-child(2)').textContent // TODO: Courses may have more than one capacity due to cross-listings - see CRN 10010
  const remaining = +html.querySelector('td.dddefault:nth-child(3)').textContent
  console.log(
    `[${courseAbbreviatedName}] ${courseName}\n` +
      `Section ${courseSection} : ${courseRegistrationNumber}\n` +
      `${remaining} of ${capacity} seats remaining\n` +
      `https://ssb.cc.binghamton.edu/banner/bwckschd.p_disp_detail_sched?term_in=${year}${semester}0&crn_in=${crn}`
  )
}

/**
 * @returns a semester code based on the current date; prioritizes spring and fall
 * TODO: Optimize so spring has more dates, and summer has less.
 */
function assumeTargetSemester(): SemesterCodes {
  const currMonthCode = new Date().getMonth() + 1
  const semesterCodes = Object.values(SemesterCodes).filter(
    (val) => !isNaN(+val)
  ) // Remove strings since TS mirrors the enum
  return (semesterCodes.find((monthCode) => monthCode >= currMonthCode) ||
    semesterCodes[1]) as number
}

fetchBinghamtonCourse(29408)
